import requests
import json
import time
import os
from datetime import datetime, timedelta, timezone

# --- Configuration ---
BASE_SCOREBOARD_URL = "http://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
BASE_SUMMARY_URL = "http://site.api.espn.com/apis/site/v2/sports/football/nfl/summary"
OUTPUT_DIR = "nfl_live_data"
UPDATE_INTERVAL_SECONDS = 100
# How many hours before a game starts should we begin fetching its detailed stats?
HOURS_BEFORE_GAME_TO_FETCH = 4

def write_json(data, filename):
    """Writes dictionary data to a JSON file in the output directory."""
    filepath = os.path.join(OUTPUT_DIR, filename)
    try:
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=4)
    except IOError as e:
        print(f"Error writing to file {filepath}: {e}")

def get_data(url):
    """Generic function to fetch data from a URL and handle errors."""
    try:
        response = requests.get(url)
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data from {url}: {e}")
        return None

def main_loop():
    """The main loop to fetch and dump NFL data."""
    # Create the output directory if it doesn't exist
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Data will be saved in the '{OUTPUT_DIR}' directory.")
    print("Starting data dumper... Press Ctrl+C to stop.")

    while True:
        print(f"\n--- {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
        
        # 1. Fetch the main scoreboard data
        print("Fetching main scoreboard...")
        scoreboard_data = get_data(BASE_SCOREBOARD_URL)

        if not scoreboard_data:
            print(f"Could not fetch scoreboard. Retrying in {UPDATE_INTERVAL_SECONDS} seconds.")
            time.sleep(UPDATE_INTERVAL_SECONDS)
            continue

        # 2. Dump the main scoreboard data
        write_json(scoreboard_data, "nfl_data.json")
        print("-> Saved nfl_data.json")

        # 3. For each active or upcoming game, fetch and dump its detailed stats
        games_to_process = []
        now_utc = datetime.now(timezone.utc)
        
        for event in scoreboard_data.get('events', []):
            status = event['status']['type']['name']
            
            # Check if the game is live
            if status == 'STATUS_IN_PROGRESS':
                games_to_process.append(event)
            # Check if the game is scheduled and starting soon
            elif status == 'STATUS_SCHEDULED':
                game_time_str = event['date']
                game_time_utc = datetime.fromisoformat(game_time_str.replace('Z', '+00:00'))
                if now_utc <= game_time_utc < now_utc + timedelta(hours=HOURS_BEFORE_GAME_TO_FETCH):
                    games_to_process.append(event)
        
        if not games_to_process:
            print("No live or upcoming games to process for detailed stats.")
        else:
            for event in games_to_process:
                game_id = event['id']
                game_name = event['shortName']
                print(f"  Processing game: {game_name} (ID: {game_id})")
                
                summary_data = get_data(f"{BASE_SUMMARY_URL}?event={game_id}")
                if summary_data:
                    write_json(summary_data, f"{game_id}_stats.json")
                    print(f"  -> Saved {game_id}_stats.json")

        print(f"Update complete. Waiting for {UPDATE_INTERVAL_SECONDS} seconds...")
        time.sleep(UPDATE_INTERVAL_SECONDS)

if __name__ == "__main__":
    try:
        main_loop()
    except KeyboardInterrupt:
        print("\nScript stopped by user. Goodbye! 👋")