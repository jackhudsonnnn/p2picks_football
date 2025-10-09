"""Unified live stats + roster updater.

Behavior:
 - Polls live NFL games (similar to live_stats.py)
 - When a game JSON is (first) saved/updated, fetch the rosters for both teams
   and store them as <team_id>.json in the shared rosters directory.
 - Roster files are ALWAYS named by numeric ESPN team id (no abbreviations, no _roster suffix).
 - In --testing mode, network calls are skipped: game JSONs are copied from the
   saved/ directory and rosters are satisfied by copying matching <team_id>.json
   files from the same saved/ directory if present.

Removed: all prior roster-specific CLI flags / polling loop. Rosters refresh is
triggered solely by presence of (or updates to) game files.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import time
from datetime import datetime
from typing import List, Optional, Set, Dict, Any

import requests
from requests.adapters import HTTPAdapter, Retry

from helpers import (
	configure_logging as helpers_configure_logging,
	NFL_LIVE_DIR,
	NFL_ROSTERS_DIR,
	get_logger,
)

# ---------------- Constants ----------------
BASE_URL = "http://site.api.espn.com/apis/site/v2/sports/football/nfl"
SCOREBOARD_URL = f"{BASE_URL}/scoreboard"
BOX_SCORE_URL_TMPL = f"{BASE_URL}/boxscore?event={{event_id}}"
ROSTER_URL_TMPL = f"{BASE_URL}/teams/{{team_id}}/roster"

LIVE_STATS_DIR = NFL_LIVE_DIR
ROSTERS_DIR = NFL_ROSTERS_DIR
HTTP_TIMEOUT_SECONDS = 15
DEFAULT_UPDATE_INTERVAL_SECONDS = 60

CLEANUP_CUTOFF_MINUTES = 30      # final games older than this removed
POST_GAME_DELETE_MINUTES = 10    # delete 'post' state sooner

LOG = get_logger("raw_live_stats")


# ---------------- Logging / Session ----------------
def configure_logging(verbosity: int) -> None:
	helpers_configure_logging(verbosity, quiet=False)


_SESSION: Optional[requests.Session] = None


def get_session() -> requests.Session:
	global _SESSION
	if _SESSION is None:
		s = requests.Session()
		retries = Retry(
			total=3,
			backoff_factor=0.5,
			status_forcelist=(500, 502, 503, 504),
			allowed_methods=("GET",),
		)
		adapter = HTTPAdapter(max_retries=retries)
		s.mount("http://", adapter)
		s.mount("https://", adapter)
		_SESSION = s
	return _SESSION


def _ensure_dirs() -> None:
	os.makedirs(LIVE_STATS_DIR, exist_ok=True)
	os.makedirs(ROSTERS_DIR, exist_ok=True)


# ---------------- I/O Helpers ----------------
def _write_json_atomic(data: dict, directory: str, filename: str, log_info: bool = True) -> None:
	os.makedirs(directory, exist_ok=True)
	path = os.path.join(directory, filename)
	tmp = path + ".tmp"
	try:
		with open(tmp, "w", encoding="utf-8") as f:
			json.dump(data, f, indent=2, ensure_ascii=False)
		os.replace(tmp, path)
		if log_info:
			LOG.info("Saved %s", filename)
		else:
			LOG.debug("Saved %s", filename)
	except OSError as e:
		LOG.error("Failed writing %s: %s", filename, e)
		try:
			if os.path.exists(tmp):
				os.remove(tmp)
		except OSError:
			pass


def _request_json(url: str) -> Optional[Dict[str, Any]]:
	try:
		session = get_session()
		resp = session.get(url, timeout=HTTP_TIMEOUT_SECONDS, headers={"User-Agent": "nfl-raw-live/1.0"})
		resp.raise_for_status()
		return resp.json()
	except requests.RequestException as e:
		LOG.warning("HTTP error %s: %s", url, e)
		return None


# ---------------- Live Game Handling ----------------
def _get_live_events() -> List[dict]:
	data = _request_json(SCOREBOARD_URL)
	if not data:
		return []
	events = data.get("events", [])
	live_events: List[dict] = []
	for ev in events:
		try:
			state = ev.get("status", {}).get("type", {}).get("state")
			if state == "in" or state == "pre":
				live_events.append(ev)
		except Exception:
			LOG.debug("Malformed event skipped: %s", ev)
	return live_events


def _fetch_boxscore(event_id: str) -> Optional[dict]:
	url = BOX_SCORE_URL_TMPL.format(event_id=event_id)
	data = _request_json(url)
	if data is None:
		# fallback to summary
		summary_url = f"{BASE_URL}/summary?event={event_id}"
		data = _request_json(summary_url)
	return data


# ---------------- Roster Handling ----------------
def _fetch_roster(team_id: str) -> Optional[dict]:
	url = ROSTER_URL_TMPL.format(team_id=team_id)
	return _request_json(url)


def _update_rosters_for_game(boxscore: dict, refreshed: Set[str]) -> None:
	"""Extract team IDs from a boxscore/summary JSON and (re)fetch rosters.

	refreshed: set collecting team_ids already refreshed this tick to avoid duplicate calls.
	"""
	try:
		comps = boxscore.get("header", {}).get("competitions", [{}])[0].get("competitors", [])
	except Exception:
		return
	for comp in comps:
		try:
			team = comp.get("team", {})
			team_id = str(team.get("id"))
			if not team_id or team_id in refreshed:
				continue
			data = _fetch_roster(team_id)
			if data:
				filename = f"{team_id}.json"
				_write_json_atomic(data, ROSTERS_DIR, filename, log_info=False)
				refreshed.add(team_id)
				LOG.info("Roster updated for team %s", team_id)
		except Exception as e:
			LOG.debug("Roster update failed for competitor %s: %s", comp, e)


# ---------------- Cleanup ----------------
def _is_final(data: dict) -> bool:
	try:
		status = data.get("header", {}).get("competitions", [{}])[0].get("status", {})
		stype = status.get("type", {})
		state = stype.get("state")
		if state == "post" or stype.get("completed"):
			return True
		if stype.get("name", "").upper() == "STATUS_FINAL":
			return True
	except Exception:
		return False
	return False


def _cleanup_old_games(now: Optional[datetime] = None) -> None:
	from datetime import timedelta
	now = now or datetime.now()
	default_cutoff = timedelta(minutes=CLEANUP_CUTOFF_MINUTES)
	post_cutoff = timedelta(minutes=POST_GAME_DELETE_MINUTES)
	try:
		files = [f for f in os.listdir(LIVE_STATS_DIR) if f.endswith('.json')]
	except FileNotFoundError:
		return
	deleted = 0
	for fname in files:
		path = os.path.join(LIVE_STATS_DIR, fname)
		try:
			st = os.stat(path)
			mtime = datetime.fromtimestamp(st.st_mtime)
			with open(path, 'r', encoding='utf-8') as f:
				data = json.load(f)
			status = data.get("header", {}).get("competitions", [{}])[0].get("status", {})
			state = status.get("type", {}).get("state")
			if state == 'post':
				if now - mtime >= post_cutoff:
					os.remove(path)
					deleted += 1
				continue
			if not _is_final(data):
				continue
			if now - mtime >= default_cutoff:
				os.remove(path)
				deleted += 1
		except Exception:
			continue
	if deleted:
		LOG.info("Cleanup removed %d final game file(s)", deleted)


# ---------------- Testing Mode Support ----------------
def _copy_test_data_games_and_rosters(fetch_rosters: bool = True) -> None:
	"""Copy mock game & roster JSONs from test_nfl_data/ structure.

	Expected layout under server/src/data/test_nfl_data/:
	  nfl_raw_live_stats/*.json   (game event JSONs)
	  nfl_rosters/<team_id>.json
	"""
	base_dir = os.path.dirname(__file__)
	data_dir = os.path.abspath(os.path.join(base_dir))
	test_root = os.path.join(data_dir, 'test_nfl_data')
	games_src = os.path.join(test_root, 'nfl_raw_live_stats')
	rosters_src = os.path.join(test_root, 'nfl_rosters')

	game_count = roster_count = 0

	# Copy games
	try:
		game_files = [f for f in os.listdir(games_src) if f.endswith('.json')]
	except FileNotFoundError:
		game_files = []
	for fname in game_files:
		src = os.path.join(games_src, fname)
		try:
			with open(src, 'r', encoding='utf-8') as f:
				data = json.load(f)
			_write_json_atomic(data, LIVE_STATS_DIR, fname)
			game_count += 1
		except Exception as e:
			LOG.warning("Testing mode: skip game %s: %s", fname, e)

	# Copy rosters
	try:
		roster_files = [f for f in os.listdir(rosters_src) if f.endswith('.json')]
	except FileNotFoundError:
		roster_files = []
	if fetch_rosters:
		for fname in roster_files:
			src = os.path.join(rosters_src, fname)
			try:
				with open(src, 'r', encoding='utf-8') as f:
					data = json.load(f)
				_write_json_atomic(data, ROSTERS_DIR, fname, log_info=False)
				roster_count += 1
			except Exception as e:
				LOG.warning("Testing mode: skip roster %s: %s", fname, e)
	else:
		if roster_files:
			LOG.info("Testing mode: roster copying disabled; found %d roster file(s) but skipping", len(roster_files))

	LOG.info("Testing mode: copied %d game file(s), %d roster file(s) from test_nfl_data/", game_count, roster_count)


# ---------------- Core Tick ----------------
def _purge_initial(first_tick: bool) -> None:
	if not first_tick:
		return
	# Clear existing game JSONs only; keep rosters (they'll be refreshed on demand)
	try:
		files = [f for f in os.listdir(LIVE_STATS_DIR) if f.endswith('.json')]
	except FileNotFoundError:
		files = []
	removed = 0
	for f in files:
		try:
			os.remove(os.path.join(LIVE_STATS_DIR, f))
			removed += 1
		except OSError:
			pass
	if removed:
		LOG.info("Initial purge: removed %d existing game file(s)", removed)


def run_tick(testing: bool, first_tick: bool, fetch_rosters: bool = True) -> None:
	_purge_initial(first_tick)
	if testing:
		_copy_test_data_games_and_rosters(fetch_rosters=fetch_rosters)
		return

	live_events = _get_live_events()
	if not live_events:
		LOG.info("No live NFL games right now.")
		return
	LOG.info("Found %d live game(s)", len(live_events))
	refreshed_rosters: Set[str] = set()
	for ev in live_events:
		event_id = str(ev.get('id'))
		if not event_id:
			continue
		LOG.debug("Fetching boxscore for game %s", event_id)
		box = _fetch_boxscore(event_id)
		if not box:
			LOG.info("Skipping %s: failed to fetch boxscore/summary", event_id)
			continue
		_write_json_atomic(box, LIVE_STATS_DIR, f"{event_id}.json")
		if fetch_rosters:
			_update_rosters_for_game(box, refreshed_rosters)
		else:
			LOG.debug("Roster fetching disabled; skipping roster update for game %s", event_id)


# ---------------- Loop ----------------
def main_loop(interval: int, max_ticks: Optional[int], jitter_percent: float, testing: bool, fetch_rosters: bool) -> None:
	_ensure_dirs()
	LOG.info("Live game stats directory: %s", LIVE_STATS_DIR)
	LOG.info("Rosters directory: %s", ROSTERS_DIR)
	if testing:
		if fetch_rosters:
			LOG.info("Testing mode enabled (using test_nfl_data/ mock games & rosters)")
		else:
			LOG.info("Testing mode enabled (using test_nfl_data/) - roster fetching disabled")
	LOG.info("Starting unified poller interval=%ss max_ticks=%s jitter=±%s%% rosters=%s", interval, max_ticks, jitter_percent, fetch_rosters)
	tick = 0
	while True:
		LOG.info("Tick %d @ %s", tick + 1, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
		try:
			run_tick(testing=testing, first_tick=(tick == 0), fetch_rosters=fetch_rosters)
			_cleanup_old_games()
		except Exception as e:
			LOG.exception("Unexpected error during tick: %s", e)
		tick += 1
		if max_ticks is not None and tick >= max_ticks:
			LOG.info("Reached max ticks (%d). Exiting.", max_ticks)
			break
		sleep_for = interval
		if jitter_percent and interval > 5:
			span = interval * (jitter_percent / 100.0)
			low = max(1, interval - span)
			high = interval + span
			sleep_for = max(1, int(random.uniform(low, high)))
		LOG.info("Sleeping %ss", sleep_for)
		time.sleep(sleep_for)


# ---------------- CLI ----------------
def parse_args() -> argparse.Namespace:
	p = argparse.ArgumentParser(description="Unified NFL live stats + roster updater")
	p.add_argument("--interval", type=int, default=DEFAULT_UPDATE_INTERVAL_SECONDS, help="Polling interval seconds (10-300, default 60)")
	p.add_argument("--once", action="store_true", help="Run a single tick then exit")
	p.add_argument("--ticks", type=int, default=None, help="Run N ticks then exit (overrides --once)")
	p.add_argument("--testing", action="store_true", help="Use saved/ JSONs for games and rosters (no network)")
	p.add_argument("--no-rosters", action="store_true", help="Disable roster fetching and copying (testing mode will skip roster files)")
	p.add_argument("--jitter", type=float, default=10.0, help="Jitter percent (±N%%), 0 disables (default 10)")
	p.add_argument("-v", action="count", default=0, help="Increase verbosity (-v, -vv)")
	return p.parse_args()


def main() -> None:
	args = parse_args()
	configure_logging(args.v)
	interval = max(10, min(args.interval, 300))
	max_ticks = 1 if args.once and args.ticks is None else args.ticks
	fetch_rosters = not bool(args.no_rosters)
	if args.no_rosters:
		LOG.info("Roster fetching disabled via --no-rosters flag")
	main_loop(interval=interval, max_ticks=max_ticks, jitter_percent=args.jitter, testing=args.testing, fetch_rosters=fetch_rosters)


if __name__ == "__main__":
	try:
		main()
	except KeyboardInterrupt:
		LOG.info("Interrupted by user. Bye.")
