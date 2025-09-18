import argparse
import random
import os
import time
import json
from datetime import datetime
from typing import Optional, List

import requests
from requests.adapters import HTTPAdapter, Retry

BASE_URL = "http://site.api.espn.com/apis/site/v2/sports/football/nfl"
SCOREBOARD_URL = f"{BASE_URL}/scoreboard"
BOX_SCORE_URL_TMPL = f"{BASE_URL}/boxscore?event={{event_id}}"
from helpers import (
	configure_logging as helpers_configure_logging,
	SAVED_DIR as SHARED_SAVED_DIR,
	NFL_LIVE_DIR as SHARED_LIVE_DIR,
	get_logger,
)

OUTPUT_DIR = SHARED_LIVE_DIR
SAVED_DIR = SHARED_SAVED_DIR
LOG = get_logger("live_stats")
DEFAULT_UPDATE_INTERVAL_SECONDS = 60
HTTP_TIMEOUT_SECONDS = 15

def configure_logging(verbosity: int) -> None:
	# Forward to shared configure_logging to keep behavior consistent
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


def ensure_output_dir():
	os.makedirs(OUTPUT_DIR, exist_ok=True)


def write_json(data: dict, filename: str) -> None:
	filepath = os.path.join(OUTPUT_DIR, filename)
	tmp_path = filepath + ".tmp"
	try:
		with open(tmp_path, "w", encoding="utf-8") as f:
			json.dump(data, f, indent=2, ensure_ascii=False)
		os.replace(tmp_path, filepath)
		LOG.debug("Saved %s", filename)
	except OSError as e:
		LOG.error("Error writing %s: %s", filepath, e)
		try:
			if os.path.exists(tmp_path):
				os.remove(tmp_path)
		except OSError:
			pass


def _copy_saved_games() -> bool:
	"""Copy all JSON files from project-root data/saved into data/nfl_live_stats.

	Returns True if any files were copied (or attempted), False if none found.
	"""
	base_dir = os.path.dirname(__file__)
	root_dir = os.path.abspath(os.path.join(base_dir, os.pardir))
	saved_path = os.path.join(root_dir, SAVED_DIR)
	try:
		files = [f for f in os.listdir(saved_path) if f.lower().endswith(".json")]
	except FileNotFoundError:
		files = []
	if not files:
		LOG.info("Testing mode: saved/ folder is empty, nothing to copy to nfl_live_stats.")
		return False
	LOG.info("Testing mode: copying %d saved game(s) to '%s/'", len(files), OUTPUT_DIR)
	for fname in files:
		fpath = os.path.join(saved_path, fname)
		try:
			with open(fpath, "r", encoding="utf-8") as f:
				raw = json.load(f)
		except Exception as e:
			LOG.warning("Failed to read saved file %s: %s", fname, e)
			continue
		write_json(raw, fname)
	return True


def get_json(url: str) -> Optional[dict]:
	try:
		session = get_session()
		resp = session.get(url, timeout=HTTP_TIMEOUT_SECONDS, headers={"User-Agent": "nfl-live-stats/1.0"})
		resp.raise_for_status()
		return resp.json()
	except requests.RequestException as e:
		LOG.warning("Request error for %s: %s", url, e)
		return None


def get_live_game_ids() -> List[str]:
	data = get_json(SCOREBOARD_URL)
	if not data:
		return []
	events = data.get("events", [])
	live_ids: List[str] = []
	for ev in events:
		try:
			status = ev.get("status", {})
			st_type = status.get("type", {})
			state = st_type.get("state")
			if state == "in":
				gid = str(ev.get("id"))
				if gid and gid not in live_ids:
					live_ids.append(gid)
		except Exception:
			LOG.debug("Skipping malformed event: %s", ev)
			continue
	return live_ids


def fetch_and_save_boxscore(event_id: str) -> None:
	url = BOX_SCORE_URL_TMPL.format(event_id=event_id)
	data = get_json(url)
	if data is None:
		summary_url = f"{BASE_URL}/summary?event={event_id}"
		data = get_json(summary_url)
		if data is None:
			LOG.info("Skipping %s: failed to fetch boxscore/summary", event_id)
			return
	filename = f"{event_id}.json"
	filepath = os.path.join(OUTPUT_DIR, filename)
	tmp_path = filepath + ".tmp"
	try:
		with open(tmp_path, "w", encoding="utf-8") as f:
			json.dump(data, f, indent=2, ensure_ascii=False)
		os.replace(tmp_path, filepath)
		LOG.info("Saved boxscore %s", filename)
	except OSError as e:
		LOG.error("Failed to write %s: %s", filename, e)
		try:
			if os.path.exists(tmp_path):
				os.remove(tmp_path)
		except OSError:
			pass


def run_once(testing: bool) -> None:
	if testing:
		# Always copy saved games in testing mode; skip network calls entirely.
		_copied = _copy_saved_games()
		if not _copied:
			LOG.info("Testing mode: no saved games copied this tick.")
		return

	live_ids = get_live_game_ids()
	if not live_ids:
		LOG.info("No live NFL games right now.")
		return
	LOG.info("Found %d live game(s): %s", len(live_ids), ", ".join(live_ids))
	for gid in live_ids:
		LOG.debug("Fetching boxscore for game %s", gid)
		fetch_and_save_boxscore(gid)


def main_loop(interval: int, max_ticks: Optional[int], jitter_percent: float, testing: bool) -> None:
	ensure_output_dir()
	LOG.info("Live game stats will be saved in '%s'.", OUTPUT_DIR)
	if testing:
		LOG.info("Testing mode enabled: always copying saved game JSONs each tick (no network calls).")
	LOG.info("Starting live stats poller. Interval=%ss max_ticks=%s jitter=±%s%%", interval, max_ticks, jitter_percent)
	tick = 0
	while True:
		LOG.info("Tick %d @ %s", tick + 1, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
		try:
			run_once(testing=testing)
		except Exception as e:
			LOG.exception("Unexpected error during poll: %s", e)
		tick += 1
		if max_ticks is not None and tick >= max_ticks:
			LOG.info("Reached max ticks (%d). Exiting.", max_ticks)
			break
		sleep_for = interval
		if jitter_percent and interval > 5:
			delta = interval * (float(jitter_percent) / 100.0)
			low = max(1, interval - delta)
			high = interval + delta
			sleep_for = max(1, int(random.uniform(low, high)))
		LOG.info("Sleeping %ss", sleep_for)
		time.sleep(sleep_for)


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(description="Poll ESPN NFL live stats boxscores")
	parser.add_argument("--interval", type=int, default=DEFAULT_UPDATE_INTERVAL_SECONDS, help="Polling interval seconds (default 60)")
	parser.add_argument("--once", action="store_true", help="Run a single tick then exit")
	parser.add_argument("--ticks", type=int, default=None, help="Run N ticks then exit (overrides --once)")
	parser.add_argument("--testing", action="store_true", help="Always copy saved/ JSONs each tick instead of calling ESPN APIs")
	parser.add_argument("--jitter", type=float, default=10.0, help="Jitter percent (±N%%). Use 0 to disable jitter. Default=10")
	parser.add_argument("-v", action="count", default=0, help="Increase verbosity (-v, -vv)")
	return parser.parse_args()


def main() -> None:
	args = parse_args()
	configure_logging(args.v)
	max_ticks = 1 if args.once and args.ticks is None else args.ticks
	# enforce allowed interval range: min 10s, max 300s (5 minutes)
	interval = max(10, min(args.interval, 300))
	main_loop(interval=interval, max_ticks=max_ticks, jitter_percent=args.jitter, testing=args.testing)


if __name__ == "__main__":
	try:
		main()
	except KeyboardInterrupt:
		LOG.info("Interrupted by user. Bye.")

