import requests
import json
import time
import os
from datetime import datetime

# --- Configuration ---
# This URL provides a list of all NFL teams
BASE_TEAMS_URL = "http://site.api.espn.com/apis/site/v2/sports/football/nfl/teams"
OUTPUT_DIR = "nfl_rosters"
# Update interval set to 24 hours (24 hours * 60 minutes/hour * 60 seconds/minute)
UPDATE_INTERVAL_SECONDS = 24 * 60 * 60

def write_json(data, filename):
    """Writes dictionary data to a JSON file in the output directory."""
    filepath = os.path.join(OUTPUT_DIR, filename)
    try:
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=4)
        print(f"  -> Successfully saved {filename}")
    except IOError as e:
        print(f"  -> Error writing to file {filepath}: {e}")

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
    """The main loop to fetch and dump NFL roster data."""
    # Create the output directory if it doesn't exist
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Roster data will be saved in the '{OUTPUT_DIR}' directory.")
    print("Starting roster dumper... Press Ctrl+C to stop.")

    while True:
        print(f"\n--- Starting daily update at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
        
        # 1. Fetch the list of all teams
        print("Fetching list of all NFL teams...")
        teams_data = get_data(BASE_TEAMS_URL)

        if not teams_data:
            print(f"Could not fetch team list. Retrying in 1 hour.")
            time.sleep(3600) # Wait for an hour before retrying if the main list fails
            continue

        # The list of teams is nested within the JSON structure
        try:
            teams = teams_data['sports'][0]['leagues'][0]['teams']
        except (KeyError, IndexError):
            print("Could not find the list of teams in the API response. Check API structure.")
            print(f"Retrying in 1 hour.")
            time.sleep(3600)
            continue

        # 2. For each team, fetch its roster
        for team_entry in teams:
            team = team_entry['team']
            team_id = team['id']
            team_name = team['displayName']
            team_abbr = team['abbreviation']
            
            print(f"Processing roster for: {team_name} ({team_abbr})")
            
            # The roster URL is typically found in the team's 'links' or can be constructed
            roster_url = f"{BASE_TEAMS_URL}/{team_id}/roster"
            
            roster_data = get_data(roster_url)
            if roster_data:
                # Save the roster using the team's abbreviation for a clear filename
                write_json(roster_data, f"{team_abbr}_roster.json")

        print(f"\n--- Update complete. Waiting for 24 hours before next update. ---")
        time.sleep(UPDATE_INTERVAL_SECONDS)

if __name__ == "__main__":
    try:
        main_loop()
    except KeyboardInterrupt:
        print("\nScript stopped by user. Goodbye! 👋")