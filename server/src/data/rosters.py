import argparse
import concurrent.futures
import json
import os
import time
from datetime import datetime
from typing import List, Tuple, Optional, Dict, Any, Iterable

import requests
from requests.adapters import HTTPAdapter, Retry

BASE_TEAMS_URL = "http://site.api.espn.com/apis/site/v2/sports/football/nfl/teams"
from helpers import configure_logging as helpers_configure_logging, NFL_ROSTERS_DIR as SHARED_ROSTERS_DIR, get_logger
DEFAULT_OUTPUT_DIR = SHARED_ROSTERS_DIR
DEFAULT_INTERVAL_SECONDS = 24 * 60 * 60  # 24h
MIN_INTERVAL = 600          # 10 minutes safeguard
MAX_INTERVAL = 24 * 60 * 60  # 24h cap
DEFAULT_TIMEOUT = 15
LOG = get_logger("rosters")


# ------------- Utility / Setup -------------
def configure_logging(verbosity: int, quiet: bool) -> None:
    # Delegate to shared configure_logging but pass quiet flag
    helpers_configure_logging(verbosity, quiet=quiet)


def build_session(retries: int, timeout: int) -> requests.Session:
    session = requests.Session()
    retry_cfg = Retry(
        total=retries,
        backoff_factor=0.5,
        status_forcelist=(500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    adapter = HTTPAdapter(max_retries=retry_cfg)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.request_timeout = timeout  # type: ignore[attr-defined]
    return session


def request_json(session: requests.Session, url: str, timeout: Optional[int] = None) -> Optional[Dict[str, Any]]:
    t = timeout if timeout is not None else getattr(session, "request_timeout", DEFAULT_TIMEOUT)
    try:
        resp = session.get(url, timeout=t, headers={"User-Agent": "nfl-rosters/1.0"})
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        LOG.warning("Request failed %s: %s", url, e)
        return None


# ------------- Team List & Selection -------------
def fetch_team_list(session: requests.Session) -> List[Tuple[str, str, str]]:
    data = request_json(session, BASE_TEAMS_URL)
    if not data:
        return []
    teams: List[Tuple[str, str, str]] = []  # (team_id, abbr, name)
    try:
        raw = data["sports"][0]["leagues"][0]["teams"]
    except (KeyError, IndexError, TypeError):
        LOG.error("API structure unexpected: cannot locate teams array")
        return []
    for entry in raw:
        try:
            tm = entry["team"]
            teams.append((tm["id"], tm["abbreviation"], tm.get("displayName", tm.get("name", tm["abbreviation"]))))
        except Exception:
            LOG.debug("Skipping malformed team entry: %s", entry)
    return teams


def parse_team_filters(cli_teams: List[str], team_file: Optional[str]) -> Optional[Iterable[str]]:
    selected = set()
    for token in cli_teams:
        for part in token.split(","):
            part = part.strip().upper()
            if part:
                selected.add(part)
    if team_file:
        try:
            with open(team_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip().upper()
                    if line and not line.startswith("#"):
                        selected.add(line)
        except OSError as e:
            LOG.error("Could not read team file %s: %s", team_file, e)
    return selected if selected else None


# ------------- Roster Fetch -------------
def fetch_roster(session: requests.Session, team_id: str) -> Optional[Dict[str, Any]]:
    url = f"{BASE_TEAMS_URL}/{team_id}/roster"
    return request_json(session, url)


def write_json_atomic(data: Dict[str, Any], out_dir: str, filename: str, indent: Optional[int]) -> bool:
    """Write JSON atomically. Always writes (no dry-run)."""
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, filename)
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=indent, ensure_ascii=False)
        os.replace(tmp, path)
        LOG.info("Saved %s", filename)
        return True
    except OSError as e:
        LOG.error("Failed writing %s: %s", path, e)
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except OSError:
            pass
        return False


# ------------- Orchestration -------------
def process_once(
    session: requests.Session,
    out_dir: str,
    team_filter: Optional[Iterable[str]],
    skip_existing: bool,
    concurrency: int,
) -> Dict[str, int]:
    start = time.time()
    teams = fetch_team_list(session)
    if not teams:
        LOG.error("No teams fetched; aborting this cycle")
        return {"total": 0, "written": 0, "skipped": 0, "failed": 0}

    if team_filter:
        team_filter_upper = {t.upper() for t in team_filter}
        teams = [t for t in teams if t[1].upper() in team_filter_upper]
        LOG.info("Filtered to %d team(s)", len(teams))

    total = len(teams)
    written = skipped = failed = 0
    # Always write pretty JSON (indent=2). The --minify flag was removed.
    indent = 2

    def worker(tpl: Tuple[str, str, str]) -> Tuple[str, bool]:
        nonlocal skipped
        team_id, abbr, name = tpl
        filename = f"{abbr}_roster.json"
        path = os.path.join(out_dir, filename)
        if skip_existing and os.path.exists(path):
            LOG.debug("Skip existing %s", filename)
            skipped += 1
            return abbr, True
        data = fetch_roster(session, team_id)
        if data is None:
            return abbr, False
        ok = write_json_atomic(data, out_dir, filename, indent)
        return abbr, ok

    # Concurrency
    if concurrency <= 1:
        for tpl in teams:
            abbr, ok = worker(tpl)
            if ok:
                written += 1
            else:
                failed += 1
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
            future_map = {pool.submit(worker, tpl): tpl for tpl in teams}
            for fut in concurrent.futures.as_completed(future_map):
                _, abbr, _ = future_map[fut]
                try:
                    abbr_ret, ok = fut.result()
                    if ok:
                        written += 1
                    else:
                        failed += 1
                except Exception as e:
                    failed += 1
                    LOG.exception("Unhandled exception fetching %s: %s", abbr, e)

    duration = time.time() - start
    LOG.info("Cycle summary: total=%d written=%d skipped=%d failed=%d time=%.1fs", total, written, skipped, failed, duration)
    return {"total": total, "written": written, "skipped": skipped, "failed": failed}


def clamp_interval(seconds: int) -> int:
    return max(MIN_INTERVAL, min(seconds, MAX_INTERVAL))


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Fetch and store NFL roster JSON data")
    p.add_argument("--interval", type=int, default=DEFAULT_INTERVAL_SECONDS, help="Seconds between full refresh cycles (default 86400)")
    p.add_argument("--once", action="store_true", help="Run a single cycle then exit")
    p.add_argument("--teams", action="append", default=[], help="Comma-separated team abbreviations to include (can repeat)")
    p.add_argument("--team-file", help="Path to file containing team abbreviations (one per line)")
    p.add_argument("--out", default=DEFAULT_OUTPUT_DIR, help="Output directory (default data/nfl_rosters)")
    p.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="HTTP timeout seconds (default 15)")
    p.add_argument("--retries", type=int, default=3, help="Retry attempts for transient HTTP errors (default 3)")
    p.add_argument("--concurrency", type=int, default=4, help="Number of concurrent roster fetches (default 4; use 1 to disable)")
    p.add_argument("--skip-existing", action="store_true", help="Skip teams whose roster file already exists")
    p.add_argument("-v", action="count", default=0, help="Increase verbosity (-v info, -vv debug)")
    p.add_argument("--quiet", action="store_true", help="Only show errors")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    configure_logging(args.v, args.quiet)
    interval = clamp_interval(args.interval)
    if interval != args.interval:
        LOG.info("Interval clamped to %ds", interval)

    session = build_session(args.retries, args.timeout)
    team_filter = parse_team_filters(args.teams, args.team_file)

    cycle = 0
    while True:
        cycle += 1
        LOG.info("Starting roster cycle %d @ %s", cycle, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        stats = process_once(
            session=session,
            out_dir=args.out,
            team_filter=team_filter,
            skip_existing=args.skip_existing,
            concurrency=max(1, args.concurrency),
        )
        if args.once:
            break
        LOG.info("Sleeping %ss before next roster cycle", interval)
        try:
            time.sleep(interval)
        except KeyboardInterrupt:
            LOG.info("Interrupted during sleep. Exiting.")
            break


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        LOG.info("Interrupted by user. Bye.")