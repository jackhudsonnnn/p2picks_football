import os
import argparse
import time
import json
from datetime import datetime
from typing import Any, Dict, List, Tuple, Optional

# Shared helpers and constants
from helpers import (
    NFL_REFINED_DIR as OUTPUT_DIR,
    NFL_LIVE_DIR as SOURCE_LIVE_DIR,
    NFL_ROSTERS_DIR as ROSTERS_DIR,
    DEFAULT_CATEGORIES,
    ensure_dir,
    now_iso_utc,
    write_json_to_dir,
    read_json,
    coerce_number,
    get_logger,
    configure_logging,
)

UPDATE_INTERVAL_SECONDS = 60
LOG = get_logger("refined_live_stats")

def set_output_dir(path: str) -> None:
    global OUTPUT_DIR
    OUTPUT_DIR = path


def ensure_output_dir() -> None:
    ensure_dir(OUTPUT_DIR)


def now_iso() -> str:
    return now_iso_utc()


def write_json(data: dict, filename: str) -> None:
    try:
        write_json_to_dir(data, OUTPUT_DIR, filename, indent=2)
        LOG.debug("Saved %s", filename)
    except Exception as e:
        LOG.error("Error writing %s: %s", filename, e)


def list_source_games() -> List[str]:
    """Return list of game_ids found under nfl_raw_live_stats/*.json"""
    src_dir = SOURCE_LIVE_DIR
    try:
        files = [f for f in os.listdir(src_dir) if f.lower().endswith(".json")]
    except FileNotFoundError:
        return []
    return [os.path.splitext(f)[0] for f in files]


def cleanup_orphan_refined_games() -> int:
    """Remove refined game JSON files whose source live JSON no longer exists.

    Returns number of files deleted.
    """
    source_ids = set(list_source_games())
    deleted = 0
    try:
        files = [f for f in os.listdir(OUTPUT_DIR) if f.lower().endswith('.json')]
    except FileNotFoundError:
        return 0
    for fname in files:
        gid = os.path.splitext(fname)[0]
        if gid not in source_ids:
            fpath = os.path.join(OUTPUT_DIR, fname)
            try:
                os.remove(fpath)
                deleted += 1
                LOG.info("Removed orphan refined file %s (no matching live source)", fname)
            except OSError:
                continue
    return deleted


def _get_boxscore_root(data: dict) -> Optional[dict]:
    # Boxscore may be at top-level or under "boxscore" or under summary->boxscore
    if not data:
        return None
    if "players" in data and "teams" in data:
        return data
    if "boxscore" in data:
        return data.get("boxscore")
    # Also handle summary payloads from live_stats fallback
    try:
        summary = data.get("summary")
        if isinstance(summary, dict) and "boxscore" in summary:
            return summary.get("boxscore")
    except Exception:
        pass
    return None


def _extract_current_possession(raw: dict) -> Optional[dict]:
    """Extract a simplified snapshot of the current possession from the raw JSON.
    Returns a dict with keys compatible with the planned /possession endpoint:
      { teamId, teamName, teamAbbreviation, down, distance, fieldPosition, period, clock }
    If unavailable, returns None.
    """
    try:
        drives = raw.get("drives") or {}
        cur = drives.get("current") or {}
        if not isinstance(cur, dict) or not cur:
            return None

        team = cur.get("team") or {}
        team_id = str(team.get("id")) if team.get("id") is not None else ""
        team_name = team.get("displayName") or team.get("name") or ""
        team_abbr = team.get("abbreviation") or ""

        # Default context from drive start/end
        period = (cur.get("start") or {}).get("period", {}).get("number")
        clock_display = (cur.get("start") or {}).get("clock", {}).get("displayValue")
        field_pos = (cur.get("start") or {}).get("text")  # e.g., "MIN 32"
        down = None
        distance = None

        plays = cur.get("plays") or []
        if isinstance(plays, list) and plays:
            last_play = plays[-1] or {}
            # Prefer ending state of the last play for current spot
            end = last_play.get("end") or {}
            start = last_play.get("start") or {}
            # Pull period/clock if present in the play
            p_period = (last_play.get("period") or {}).get("number")
            p_clock = (last_play.get("clock") or {}).get("displayValue")
            if p_period is not None:
                period = p_period
            if p_clock:
                clock_display = p_clock

            # Choose most recent down/distance
            down = end.get("down") if end.get("down") is not None else start.get("down")
            distance = end.get("distance") if end.get("distance") is not None else start.get("distance")

            # Field position text preference: end.possessionText -> end.downDistanceText -> drive.start.text
            field_pos = (
                end.get("possessionText")
                or end.get("downDistanceText")
                or field_pos
            )

        # Normalize numeric types
        try:
            down = int(down) if down is not None else None
        except Exception:
            down = None
        try:
            distance = int(distance) if distance is not None else None
        except Exception:
            distance = None

        result = {
            "teamId": team_id,
            "teamName": team_name,
            "teamAbbreviation": team_abbr,
            "down": down,
            "distance": distance,
            "fieldPosition": field_pos,
            "period": period,
            "clock": clock_display,
        }
        # If we have no team id and no fields at all, consider it missing
        if not any(result.values()):
            return None
        return result
    except Exception:
        return None


def _extract_team_meta(team_obj: dict) -> Tuple[str, str, str]:
    team_id = str(team_obj.get("id")) if team_obj else ""
    abbr = team_obj.get("abbreviation") if team_obj else ""
    name = team_obj.get("displayName") if team_obj else ""
    return team_id, abbr, name


def _extract_athlete_meta(a: dict) -> Dict[str, Any]:
    ath = a.get("athlete", {}) if a else {}
    pos = ath.get("position") or {}
    return {
        "athleteId": str(ath.get("id")) if ath.get("id") is not None else "",
        "fullName": ath.get("displayName") or ath.get("fullName") or "",
        "position": pos.get("abbreviation") or pos.get("name") or "",
        "jersey": ath.get("jersey") or "",
        "headshot": (ath.get("headshot") or {}).get("href") if isinstance(ath.get("headshot"), dict) else "",
    }


def _parse_athlete_stats_for_category(stat_cat: dict, athlete_entry: dict) -> Dict[str, Any]:
    # Prefer keys[] to align with stats[] list
    keys = stat_cat.get("keys") or []
    stats_val = athlete_entry.get("stats")
    if isinstance(stats_val, list) and keys:
        paired = {k: coerce_number(stats_val[i]) if i < len(stats_val) else 0 for i, k in enumerate(keys)}
        return paired
    # Sometimes there's a dict
    if isinstance(stats_val, dict):
        return {k: coerce_number(v) for k, v in stats_val.items()}
    # Fallbacks seen in some payloads
    totals = athlete_entry.get("totals")
    if isinstance(totals, list) and keys:
        return {k: coerce_number(totals[i]) if i < len(totals) else 0 for i, k in enumerate(keys)}
    return {}


def _parse_category_totals(stat_cat: dict) -> Dict[str, Any]:
    """Parse the category level totals list into a {key: value} map similar to athlete parsing.
    We mirror the logic of _parse_athlete_stats_for_category but for the top-level team totals
    that live under boxscore -> players -> statistics -> totals.
    """
    keys = stat_cat.get("keys") or []
    totals = stat_cat.get("totals")
    if isinstance(totals, list) and keys:
        return {k: coerce_number(totals[i]) if i < len(totals) else 0 for i, k in enumerate(keys)}
    if isinstance(totals, dict):
        return {k: coerce_number(v) for k, v in totals.items()}
    return {}


def _init_target_stats() -> Dict[str, Dict[str, Any]]:
    """Create a deep-ish copy of DEFAULT_CATEGORIES preserving special string defaults."""
    out: Dict[str, Dict[str, Any]] = {}
    for cat, fields in DEFAULT_CATEGORIES.items():
        out[cat] = {k: (v if isinstance(v, str) else 0) for k, v in fields.items()}
    return out


def _ensure_team_entry(
    teams: Dict[str, Dict[str, Any]],
    team_id: str,
    abbr: str,
    name: str,
    scores: Dict[str, Any],
    possession_map: Dict[str, bool],
) -> Dict[str, Any]:
    """Ensure a team container exists in teams_out with baseline fields populated."""
    if team_id in teams:
        entry = teams[team_id]
        if abbr and not entry.get("abbreviation"):
            entry["abbreviation"] = abbr
        if name and not entry.get("displayName"):
            entry["displayName"] = name
        if not entry.get("teamId"):
            entry["teamId"] = team_id
        if entry.get("score") is None:
            entry["score"] = scores.get(team_id, 0)
        entry["possession"] = bool(possession_map.get(team_id, False))
        if not isinstance(entry.get("stats"), dict):
            entry["stats"] = _init_target_stats()
        if not isinstance(entry.get("players"), dict):
            entry["players"] = {}
        return entry

    entry = {
        "teamId": team_id,
        "abbreviation": abbr,
        "displayName": name,
        "score": scores.get(team_id, 0),
        "stats": _init_target_stats(),
        "players": {},
    "possession": bool(possession_map.get(team_id, False)),
    }
    teams[team_id] = entry
    return entry


def _apply_category_mappings(target: Dict[str, Dict[str, Any]], cat_name: str, parsed: Dict[str, Any]) -> None:
    """Map ESPN category+keys into our target schema."""
    if not parsed:
        return
    cn = (cat_name or "").lower()

    def nz(name: str) -> Any:
        return coerce_number(parsed.get(name))

    if cn == "passing":
        # ESPN already provides combined/text keys in this feed. Prefer direct keys, fallback to components.
        comp_att = parsed.get("completions/passingAttempts")
        if comp_att is not None and str(comp_att).strip() != "":
            target["passing"]["completions/passingAttempts"] = comp_att
        else:
            comp = nz("completions")
            att = nz("attempts")
            if comp or att:
                target["passing"]["completions/passingAttempts"] = f"{comp}/{att}"

        target["passing"]["passingYards"] = nz("passingYards") or nz("yards")
        target["passing"]["yardsPerPassAttempt"] = nz("yardsPerPassAttempt") or nz("yardsPerAttempt")
        target["passing"]["passingTouchdowns"] = nz("passingTouchdowns") or nz("touchdowns")
        target["passing"]["interceptions"] = nz("interceptions")

        sacks_combo = parsed.get("sacks-sackYardsLost")
        if sacks_combo is not None and str(sacks_combo).strip() != "":
            target["passing"]["sacks-sackYardsLost"] = sacks_combo
        else:
            sacks = nz("sacks")
            syl = nz("sackYardsLost") or nz("sackYards")
            if sacks or syl:
                target["passing"]["sacks-sackYardsLost"] = f"{sacks}-{syl}"

        target["passing"]["adjQBR"] = nz("adjQBR") or nz("qbr")
        target["passing"]["QBRating"] = nz("QBRating") or nz("rating") or nz("passerRating")
        return

    if cn == "rushing":
        target["rushing"]["rushingAttempts"] = nz("rushingAttempts") or nz("attempts")
        target["rushing"]["rushingYards"] = nz("rushingYards") or nz("yards")
        target["rushing"]["yardsPerRushAttempt"] = nz("yardsPerRushAttempt") or nz("yardsPerCarry")
        target["rushing"]["rushingTouchdowns"] = nz("rushingTouchdowns") or nz("touchdowns")
        target["rushing"]["longRushing"] = nz("longRushing") or nz("longest")
        return

    if cn == "receiving":
        target["receiving"]["receptions"] = nz("receptions")
        target["receiving"]["receivingYards"] = nz("receivingYards") or nz("yards")
        target["receiving"]["yardsPerReception"] = nz("yardsPerReception")
        target["receiving"]["receivingTouchdowns"] = nz("receivingTouchdowns") or nz("touchdowns")
        target["receiving"]["longReception"] = nz("longReception") or nz("longest")
        target["receiving"]["receivingTargets"] = nz("receivingTargets") or nz("targets")
        return

    if cn == "fumbles":
        target["fumbles"]["fumbles"] = nz("fumbles")
        target["fumbles"]["fumblesLost"] = nz("fumblesLost") or nz("lost")
        target["fumbles"]["fumblesRecovered"] = nz("fumblesRecovered") or nz("recovered")
        return

    # ESPN often uses "defense" for player defense
    if cn in ("defense", "defensive"):
        # Primary defensive
        target["defensive"]["totalTackles"] = nz("totalTackles") or nz("tackles")
        target["defensive"]["soloTackles"] = nz("soloTackles")
        target["defensive"]["sacks"] = nz("sacks")
        target["defensive"]["tacklesForLoss"] = nz("tacklesForLoss") or nz("tfl")
        target["defensive"]["passesDefended"] = nz("passesDefended")
        target["defensive"]["QBHits"] = nz("qbHits")
        target["defensive"]["defensiveTouchdowns"] = nz("touchdowns")
        # Fill interceptions bucket from defense if present
        ints = nz("interceptions")
        int_yds = nz("interceptionYards") or nz("yards")
        int_tds = nz("interceptionTouchdowns") or nz("touchdowns")
        if ints:
            target["interceptions"]["interceptions"] = ints
        if int_yds:
            target["interceptions"]["interceptionYards"] = int_yds
        if int_tds:
            target["interceptions"]["interceptionTouchdowns"] = int_tds
        return

    if cn == "interceptions":
        target["interceptions"]["interceptions"] = nz("interceptions") or nz("picks")
        target["interceptions"]["interceptionYards"] = nz("interceptionYards") or nz("yards")
        target["interceptions"]["interceptionTouchdowns"] = nz("touchdowns") or nz("interceptionTouchdowns")
        return

    if cn == "kickreturns":
        target["kickReturns"]["kickReturns"] = nz("kickReturns") or nz("returns")
        target["kickReturns"]["kickReturnYards"] = nz("kickReturnYards") or nz("yards")
        target["kickReturns"]["yardsPerKickReturn"] = nz("yardsPerKickReturn") or nz("average")
        target["kickReturns"]["longKickReturn"] = nz("longKickReturn") or nz("longest")
        target["kickReturns"]["kickReturnTouchdowns"] = nz("kickReturnTouchdowns") or nz("touchdowns")
        return

    if cn == "puntreturns":
        target["puntReturns"]["puntReturns"] = nz("puntReturns") or nz("returns")
        target["puntReturns"]["puntReturnYards"] = nz("puntReturnYards") or nz("yards")
        target["puntReturns"]["yardsPerPuntReturn"] = nz("yardsPerPuntReturn") or nz("average")
        target["puntReturns"]["longPuntReturn"] = nz("longPuntReturn") or nz("longest")
        target["puntReturns"]["puntReturnTouchdowns"] = nz("puntReturnTouchdowns") or nz("touchdowns")
        return

    if cn == "kicking":
        fg_combo = parsed.get("fieldGoalsMade/fieldGoalAttempts")
        if fg_combo is not None and str(fg_combo).strip() != "":
            target["kicking"]["fieldGoalsMade/fieldGoalAttempts"] = fg_combo
        else:
            fgm = nz("fgm")
            fga = nz("fga")
            if fgm or fga:
                target["kicking"]["fieldGoalsMade/fieldGoalAttempts"] = f"{fgm}/{fga}"
        target["kicking"]["fieldGoalPct"] = nz("fieldGoalPct") or nz("fgPct")
        target["kicking"]["longFieldGoalMade"] = nz("longFieldGoalMade") or nz("longest")
        xp_combo = parsed.get("extraPointsMade/extraPointAttempts")
        if xp_combo is not None and str(xp_combo).strip() != "":
            target["kicking"]["extraPointsMade/extraPointAttempts"] = xp_combo
        else:
            xpm = nz("xpm")
            xpa = nz("xpa")
            if xpm or xpa:
                target["kicking"]["extraPointsMade/extraPointAttempts"] = f"{xpm}/{xpa}"
        target["kicking"]["totalKickingPoints"] = nz("totalKickingPoints") or nz("points")
        return

    if cn == "punting":
        target["punting"]["punts"] = nz("punts")
        target["punting"]["puntYards"] = nz("puntYards") or nz("yards")
        target["punting"]["grossAvgPuntYards"] = nz("grossAvgPuntYards") or nz("average")
        target["punting"]["touchbacks"] = nz("touchbacks")
        target["punting"]["puntsInside20"] = nz("puntsInside20") or nz("inside20")
        target["punting"]["longPunt"] = nz("longPunt") or nz("longest")
        return


def refine_boxscore(raw: dict, event_id: str) -> dict:
    box = _get_boxscore_root(raw)
    if not box:
        return {
            "eventId": event_id,
            "generatedAt": now_iso(),
            "teams": [],
            "note": "No boxscore in payload",
        }

    # Collect teams and players with target schema
    teams_out: Dict[str, Dict[str, Any]] = {}

    # Pre-extract scores from header.competitions[].competitors[]
    scores: Dict[str, Any] = {}
    possession_map: Dict[str, bool] = {}
    try:
        comps = (raw.get("header") or {}).get("competitions") or []
        if isinstance(comps, list):
            for comp in comps:
                for competitor in comp.get("competitors", []):
                    tinfo = competitor.get("team", {}) or {}
                    tid = str(tinfo.get("id")) if tinfo.get("id") is not None else ""
                    if tid:
                        sc = competitor.get("score")
                        if sc is not None:
                            scores[tid] = coerce_number(sc)
                        possession_map[tid] = bool(competitor.get("possession"))
    except Exception:
        pass

    for team_block in box.get("players", []):
        team_meta = team_block.get("team", {})
        team_id, abbr, name = _extract_team_meta(team_meta)
        if not team_id:
            continue
        team_entry = _ensure_team_entry(teams_out, team_id, abbr, name, scores, possession_map)

        # Build index: athleteId -> target stats buckets
        temp_player_targets: Dict[str, Dict[str, Dict[str, Any]]] = {}

        for stat_cat in team_block.get("statistics", []):
            cat_name = stat_cat.get("name") or "unknown"
            # First, process team-level totals for this category into team stats
            team_totals_parsed = _parse_category_totals(stat_cat)
            if team_totals_parsed:
                _apply_category_mappings(team_entry["stats"], cat_name, team_totals_parsed)
            for a in stat_cat.get("athletes", []):
                meta = _extract_athlete_meta(a)
                raw_aid = meta.get("athleteId") or ""
                # Use roster-style fallback key when athlete id is missing so merging works: name:Full Name
                athlete_key = raw_aid if raw_aid else f"name:{meta.get('fullName','')}"

                # Init player container if needed
                team_players = team_entry["players"]
                if athlete_key not in team_players:
                    team_players[athlete_key] = {
                        "athleteId": raw_aid,
                        "fullName": meta["fullName"],
                        "position": meta["position"],
                        "jersey": meta["jersey"],
                        "headshot": meta["headshot"],
                        "stats": _init_target_stats(),
                    }

                if athlete_key not in temp_player_targets:
                    temp_player_targets[athlete_key] = team_players[athlete_key]["stats"]

                parsed = _parse_athlete_stats_for_category(stat_cat, a)
                _apply_category_mappings(temp_player_targets[athlete_key], cat_name, parsed)

    # Ensure teams are initialized even if no player stats are present (e.g., pre-game state)
    for team_block in box.get("teams", []):
        team_meta = team_block.get("team", {}) or {}
        team_id, abbr, name = _extract_team_meta(team_meta)
        if not team_id:
            continue
        team_entry = _ensure_team_entry(teams_out, team_id, abbr, name, scores, possession_map)
        home_away = team_block.get("homeAway")
        if home_away:
            team_entry["homeAway"] = home_away
        display_order = team_block.get("displayOrder")
        if display_order is not None:
            team_entry["displayOrder"] = display_order

    # Convert players dict -> list for stable/portable JSON
    # --- Scoring Plays Aggregation (touchdowns / field goals / safeties) ---
    try:
        scoring_plays = raw.get("scoringPlays") or raw.get("scoringplays") or []
        if isinstance(scoring_plays, list) and scoring_plays:
            # Initialize counts per team present in teams_out
            scoring_counts: Dict[str, Dict[str, int]] = {}
            for tid in teams_out.keys():
                scoring_counts[tid] = {"touchdowns": 0, "fieldGoals": 0, "safeties": 0}

            for sp in scoring_plays:
                if not isinstance(sp, dict):
                    continue
                team_obj = sp.get("team") or {}
                tid = str(team_obj.get("id")) if team_obj.get("id") is not None else ""
                if not tid or tid not in teams_out:
                    continue
                # Prefer scoringType.abbreviation then fallback to type.abbreviation
                st = sp.get("scoringType") or {}
                tp = sp.get("type") or {}
                abbr = (st.get("abbreviation") or tp.get("abbreviation") or "").strip().upper()
                if abbr == "TD":
                    scoring_counts[tid]["touchdowns"] += 1
                elif abbr == "FG":
                    scoring_counts[tid]["fieldGoals"] += 1
                elif abbr == "S":
                    scoring_counts[tid]["safeties"] += 1

            # Attach to each team's stats under new 'scoring' category
            for tid, counts in scoring_counts.items():
                team_stats = teams_out[tid].setdefault("stats", {})
                team_stats["scoring"] = {
                    "touchdowns": counts["touchdowns"],
                    "fieldGoals": counts["fieldGoals"],
                    "safeties": counts["safeties"],
                }
    except Exception:
        # Swallow errors; scoring stats are additive convenience
        pass

    # After adding scoring stats, convert players collections
    for t in teams_out.values():
        if isinstance(t.get("players"), dict):
            t["players"] = list(t["players"].values())

    # Extract normalized status string and current period (if applicable)
    def _extract_status_and_period(payload: dict) -> Tuple[str, Optional[int]]:
        status_name = "STATUS_UNKNOWN"
        period_value: Optional[int] = None
        try:
            header = payload.get("header") or {}
            competitions = header.get("competitions") or []
            comp = competitions[0] if competitions else {}
            status_obj = comp.get("status") or {}
            status_type = status_obj.get("type") or {}

            raw_name = (status_type.get("name") or "").strip().upper()
            if raw_name:
                status_name = raw_name
            else:
                state = (status_type.get("state") or "").strip().lower()
                mapping = {
                    "pre": "STATUS_SCHEDULED",
                    "in": "STATUS_IN_PROGRESS",
                    "post": "STATUS_FINAL",
                    "halftime": "STATUS_HALFTIME",
                }
                status_name = mapping.get(state, "STATUS_UNKNOWN")

            raw_period = None if status_name == "STATUS_SCHEDULED" else status_obj.get("period")
            if raw_period is not None:
                try:
                    period_int = int(raw_period)
                    if period_int > 0:
                        period_value = period_int
                except (TypeError, ValueError):
                    period_value = None
        except Exception:
            pass

        return status_name, period_value

    status, period = _extract_status_and_period(raw)

    refined = {
        "eventId": event_id,
        "generatedAt": now_iso(),
        "source": "espn-nfl-boxscore",
        "status": status,
        "period": period,
        "teams": list(teams_out.values()),
    }

    return refined


def read_raw_from_source(event_id: str) -> Optional[dict]:
    fpath = os.path.join(SOURCE_LIVE_DIR, f"{event_id}.json")
    data = read_json(fpath)
    if data is None:
        LOG.warning("Failed to read source live file for %s", event_id)
    return data


def _load_roster_players() -> Dict[str, Dict[str, Any]]:
    """Map teamAbbr -> { athleteId(str) -> meta }. Uses nfl_rosters/*.json.
    We try to derive athleteId (string). If missing, we still create entries keyed by name to ensure zero init.
    """
    roster_dir = ROSTERS_DIR
    result: Dict[str, Dict[str, Any]] = {}
    try:
        files = [f for f in os.listdir(roster_dir) if f.lower().endswith(".json")]
    except FileNotFoundError:
        return result

    for fname in files:
        fpath = os.path.join(roster_dir, fname)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue

        inferred_abbr: Optional[str] = None
        inferred_team_id: Optional[str] = None
        if fname.endswith("_roster.json"):
            inferred_abbr = fname.split("_", 1)[0]

        team_meta = data.get("team") or {}
        if isinstance(team_meta, dict):
            inferred_team_id = (
                str(team_meta.get("id")) if team_meta.get("id") is not None else None
            )
            abbr_candidate = team_meta.get("abbreviation") or team_meta.get("slug")
            if not inferred_abbr and isinstance(abbr_candidate, str):
                inferred_abbr = abbr_candidate
        if not inferred_abbr:
            inferred_abbr = os.path.splitext(fname)[0]

        if inferred_abbr:
            inferred_abbr = inferred_abbr.strip().upper()
        if inferred_team_id:
            inferred_team_id = inferred_team_id.strip()
        if not inferred_abbr and not inferred_team_id:
            continue

        team_players: Dict[str, Any] = {}
        # ESPN roster payload shape can vary; try common paths
        athletes = []
        try:
            # Typical: team -> athletes
            teams = data.get("athletes") or []
            if isinstance(teams, list) and teams and isinstance(teams[0], dict) and "items" in teams[0]:
                # Grouped by position
                for grp in teams:
                    for item in grp.get("items", []):
                        athletes.append(item)
            elif isinstance(teams, list):
                athletes = teams
        except Exception:
            pass

        for a in athletes:
            aid = str(a.get("id")) if a.get("id") is not None else None
            display = a.get("displayName") or a.get("fullName") or ""
            pos_field = a.get("position")
            if isinstance(pos_field, dict):
                position = pos_field.get("abbreviation") or pos_field.get("displayName") or pos_field.get("name") or ""
            elif isinstance(pos_field, str):
                position = pos_field
            else:
                position = ""
            jersey = a.get("jersey") or ""
            headshot = (a.get("headshot") or {}).get("href") if isinstance(a.get("headshot"), dict) else ""
            key = aid if aid else f"name:{display}"
            team_players[key] = {
                "athleteId": aid or "",
                "fullName": display,
                "position": position,
                "jersey": jersey,
                "headshot": headshot,
            }

        if inferred_abbr:
            result[inferred_abbr] = team_players
        if inferred_team_id:
            result[inferred_team_id] = team_players
    return result


def _merge_roster_zero_init(refined_players: dict, roster_map: Dict[str, Dict[str, Any]]) -> dict:
    """Ensure every rostered player for the in-game teams appears with zero-initialized categories.
    Only augments teams already present in refined_players (i.e., the two teams in the game).
    """
    category_fields_union: Dict[str, set] = {k: set(v.keys()) for k, v in DEFAULT_CATEGORIES.items()}
    # Also union any keys already present in refined_players
    for team in refined_players.get("teams", []):
        players_container = team.get("players", {})
        # support players as dict (keyed) or list (array of player objects)
        if isinstance(players_container, dict):
            player_iter = players_container.values()
        elif isinstance(players_container, list):
            player_iter = players_container
        else:
            player_iter = []

        for p in player_iter:
            if not isinstance(p, dict):
                continue
            for cat, stats in p.get("stats", {}).items():
                category_fields_union.setdefault(cat, set())
                for k in stats.keys():
                    category_fields_union[cat].add(k)

    # Build a mapping (teamId/abbr variants) -> team container
    team_lookup: Dict[str, Dict[str, Any]] = {}
    for team in refined_players.get("teams", []):
        abbr = team.get("abbreviation")
        team_id = team.get("teamId")
        # Normalize players container to dict keyed by athleteId or name:Full Name
        players = team.get("players") or []
        if isinstance(players, list):
            players_dict: Dict[str, Any] = {}
            for p in players:
                key = p.get("athleteId") or f"name:{p.get('fullName','')}"
                players_dict[key] = p
            team["players"] = players_dict
        elif isinstance(players, dict):
            # assume already keyed
            pass
        else:
            team["players"] = {}

        if isinstance(abbr, str) and abbr:
            team_lookup[abbr] = team
            team_lookup[abbr.upper()] = team
        if isinstance(team_id, str) and team_id:
            team_lookup[team_id] = team
        elif team_id is not None:
            team_lookup[str(team_id)] = team

    all_categories = set(DEFAULT_CATEGORIES.keys()) | set(category_fields_union.keys())

    for key, roster_players in roster_map.items():
        lookup_key = key if isinstance(key, str) else str(key)
        team = team_lookup.get(lookup_key)
        if not team and isinstance(lookup_key, str):
            team = team_lookup.get(lookup_key.upper())
        if not team:
            # Skip teams not in this game
            continue
        players = team.setdefault("players", {})
        for key, meta in roster_players.items():
            pid = meta.get("athleteId") or key
            if pid not in players:
                players[pid] = {
                    "athleteId": meta.get("athleteId", ""),
                    "fullName": meta.get("fullName", ""),
                    "position": meta.get("position", ""),
                    "jersey": meta.get("jersey", ""),
                    "headshot": meta.get("headshot", ""),
                    "stats": {},
                }
            else:
                # Backfill missing metadata from roster
                if not players[pid].get("position") and meta.get("position"):
                    players[pid]["position"] = meta.get("position")
                if not players[pid].get("jersey") and meta.get("jersey"):
                    players[pid]["jersey"] = meta.get("jersey")
                if not players[pid].get("headshot") and meta.get("headshot"):
                    players[pid]["headshot"] = meta.get("headshot")
            # Ensure zero-init
            for cat in all_categories:
                defaults = {}
                base_cat_defaults = DEFAULT_CATEGORIES.get(cat, {})
                for k, v in base_cat_defaults.items():
                    defaults[k] = v if isinstance(v, str) else 0
                for k in category_fields_union.get(cat, set()):
                    if k not in defaults:
                        defaults[k] = 0
                current = players[pid]["stats"].get(cat, {})
                for k, v in defaults.items():
                    if k not in current:
                        current[k] = v
                players[pid]["stats"][cat] = current

    # Convert players dicts back to lists for stable output ordering
    for team in refined_players.get("teams", []):
        players_container = team.get("players")
        if isinstance(players_container, dict):
            team["players"] = sorted(
                players_container.values(),
                key=lambda p: (
                    (p.get("fullName") or "").lower(),
                    p.get("athleteId") or "",
                ),
            )
    return refined_players


def main_loop(interval: int, max_ticks: Optional[int]) -> None:
    ensure_output_dir()
    LOG.info("Refined live stats will be saved in '%s'. Reading from '%s'.", OUTPUT_DIR, SOURCE_LIVE_DIR)
    LOG.info("Starting refined live stats poller. Interval=%ss max_ticks=%s", interval, max_ticks)
    tick = 0
    while True:
        LOG.info("Tick %d @ %s", tick + 1, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        try:
            # Process all games present in nfl_raw_live_stats/
            ids = list_source_games()
            if not ids:
                LOG.info("No source game files in nfl_raw_live_stats/ yet.")
            # First, remove any refined files that no longer have a source counterpart
            removed = cleanup_orphan_refined_games()
            if removed:
                LOG.debug("Orphan refined cleanup removed %d file(s)", removed)
            for gid in ids:
                LOG.info("Refining game %s from nfl_raw_live_stats…", gid)
                raw = read_raw_from_source(gid)
                if not raw:
                    continue
                players_only = refine_boxscore(raw, gid)
                # Zero-init with roster data
                roster_map = _load_roster_players()
                players_zeroed = _merge_roster_zero_init(players_only, roster_map)
                # Team stats already populated from players.statistics.totals
                write_json(players_zeroed, f"{gid}.json")
        except Exception as e:
            LOG.exception("Unexpected error: %s", e)
        tick += 1
        if max_ticks is not None and tick >= max_ticks:
            LOG.info("Reached max ticks (%d). Exiting.", max_ticks)
            break
        LOG.info("Sleeping %ss…", interval)
        time.sleep(interval)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Refine local NFL live stats into normalized per-player JSON")
    p.add_argument("--interval", type=int, default=UPDATE_INTERVAL_SECONDS, help="Seconds between refine cycles (default 60)")
    p.add_argument("--once", action="store_true", help="Run a single cycle then exit")
    p.add_argument("--ticks", type=int, default=None, help="Run N cycles then exit (overrides --once)")
    p.add_argument("--out", default=OUTPUT_DIR, help="Output directory for refined files (default data/nfl_refined_live_stats)")
    p.add_argument("-v", action="count", default=0, help="Increase verbosity (-v info, -vv debug)")
    p.add_argument("--quiet", action="store_true", help="Only show errors")
    return p.parse_args()


if __name__ == "__main__":
    try:
        args = parse_args()
        configure_logging(args.v, args.quiet)
        # Clamp interval similar to live_stats: 10..300 seconds
        interval = max(10, min(args.interval, 300))
        max_ticks = 1 if args.once and args.ticks is None else args.ticks
        if args.out and args.out != OUTPUT_DIR:
            set_output_dir(args.out)
        main_loop(interval=interval, max_ticks=max_ticks)
    except KeyboardInterrupt:
        LOG.info("Stopped by user. Bye.")
