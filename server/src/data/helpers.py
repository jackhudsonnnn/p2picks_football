import os
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional, List, Dict

# Paths
NFL_LIVE_DIR = "nfl_live_stats"
NFL_REFINED_DIR = "nfl_refined_live_stats"
NFL_ROSTERS_DIR = "nfl_rosters"
SAVED_DIR = "saved"

# Constants
DEFAULT_CATEGORIES: Dict[str, Dict[str, Any]] = {
    "passing": {
    "completions/passingAttempts": "0/0",
        "passingYards": 0,
        "yardsPerPassAttempt": 0,
        "passingTouchdowns": 0,
        "interceptions": 0,
    "sacks-sackYardsLost": "0-0",
        "adjQBR": 0,
        "QBRating": 0,
    },
    "rushing": {
        "rushingAttempts": 0,
        "rushingYards": 0,
        "yardsPerRushAttempt": 0,
        "rushingTouchdowns": 0,
        "longRushing": 0,
    },
    "receiving": {
        "receptions": 0,
        "receivingYards": 0,
        "yardsPerReception": 0,
        "receivingTouchdowns": 0,
        "longReception": 0,
        "receivingTargets": 0,
    },
    "fumbles": {
        "fumbles": 0,
        "fumblesLost": 0,
        "fumblesRecovered": 0,
    },
    "defensive": {
        "totalTackles": 0,
        "soloTackles": 0,
        "sacks": 0,
        "tacklesForLoss": 0,
        "passesDefended": 0,
        "QBHits": 0,
        "defensiveTouchdowns": 0,
    },
    "interceptions": {
        "interceptions": 0,
        "interceptionYards": 0,
        "interceptionTouchdowns": 0,
    },
    "kickReturns": {
        "kickReturns": 0,
        "kickReturnYards": 0,
        "yardsPerKickReturn": 0,
        "longKickReturn": 0,
        "kickReturnTouchdowns": 0,
    },
    "puntReturns": {
        "puntReturns": 0,
        "puntReturnYards": 0,
        "yardsPerPuntReturn": 0,
        "longPuntReturn": 0,
        "puntReturnTouchdowns": 0,
    },
    "kicking": {
    "fieldGoalsMade/fieldGoalAttempts": "0/0",
        "fieldGoalPct": 0,
        "longFieldGoalMade": 0,
    "extraPointsMade/extraPointAttempts": "0/0",
        "totalKickingPoints": 0,
    },
    "punting": {
        "punts": 0,
        "puntYards": 0,
        "grossAvgPuntYards": 0,
        "touchbacks": 0,
        "puntsInside20": 0,
        "longPunt": 0,
    },
}

def ensure_dir(path: str) -> None:
	os.makedirs(path, exist_ok=True)


def get_logger(name: str) -> logging.Logger:
	logger = logging.getLogger(name)
	if not logger.handlers:
		# Default to INFO if root not configured; let callers override via basicConfig elsewhere
		logger.setLevel(logging.INFO)
		handler = logging.StreamHandler()
		handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s", datefmt="%H:%M:%S"))
		logger.addHandler(handler)
		logger.propagate = False
	return logger


def configure_logging(verbosity: int, quiet: bool = False) -> None:
	if quiet:
		level = logging.ERROR
	else:
		level = logging.WARNING
		if verbosity == 1:
			level = logging.INFO
		elif verbosity >= 2:
			level = logging.DEBUG
	logging.basicConfig(
		level=level,
		format="%(asctime)s %(levelname)s %(name)s: %(message)s",
		datefmt="%H:%M:%S",
	)


def now_iso_utc() -> str:
	return datetime.now(timezone.utc).isoformat()


def write_json_to_dir(data: dict, out_dir: str, filename: str, indent: Optional[int] = 2) -> None:
	ensure_dir(out_dir)
	path = os.path.join(out_dir, filename)
	tmp = path + ".tmp"
	with open(tmp, "w", encoding="utf-8") as f:
		json.dump(data, f, indent=indent, ensure_ascii=False)
	os.replace(tmp, path)


def read_json(path: str) -> Optional[dict]:
	try:
		with open(path, "r", encoding="utf-8") as f:
			return json.load(f)
	except Exception:
		return None


def list_json_ids(dir_path: str) -> List[str]:
	try:
		files = [f for f in os.listdir(dir_path) if f.lower().endswith(".json")]
	except FileNotFoundError:
		return []
	return [os.path.splitext(f)[0] for f in files]


def coerce_number(val: Any) -> Any:
	"""Return int/float when possible, else original string; None/empty-like -> 0."""
	if val is None:
		return 0
	if isinstance(val, (int, float)):
		return val
	s = str(val).strip()
	if s in ("", "--", "-", "N/A"):
		return 0
	s2 = s.replace(",", "")
	try:
		return int(s2)
	except ValueError:
		try:
			return float(s2)
		except ValueError:
			return s
