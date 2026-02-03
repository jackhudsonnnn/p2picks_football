"""NBA data helper using nba_api.

Provides lightweight CLI to fetch today's scoreboard or a specific game
boxscore and emit JSON to stdout for consumption by the Node service.

Usage:
  python nba-data.py scoreboard
  python nba-data.py boxscore <game_id>
"""

import argparse
import json
import sys

from nba_api.live.nba.endpoints import scoreboard, boxscore


def fetch_scoreboard() -> None:
    """Fetch today's scoreboard and print JSON to stdout."""
    data = scoreboard.ScoreBoard().get_dict()
    json.dump(data, sys.stdout)


def fetch_boxscore(game_id: str) -> None:
    """Fetch a single game boxscore and print JSON to stdout."""
    data = boxscore.BoxScore(game_id).get_dict()
    json.dump(data, sys.stdout)


def main() -> int:
    parser = argparse.ArgumentParser(description="NBA data helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("scoreboard", help="Fetch today's scoreboard")

    box_parser = subparsers.add_parser("boxscore", help="Fetch boxscore for a game")
    box_parser.add_argument("game_id", help="NBA game ID, e.g. 0022500626")

    args = parser.parse_args()

    try:
        if args.command == "scoreboard":
            fetch_scoreboard()
        elif args.command == "boxscore":
            fetch_boxscore(args.game_id)
    except Exception as exc:  # noqa: BLE001 - want full error to bubble to Node
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
