/**
 * NBA API Client
 * 
 * Fetches live game data from NBA.com CDN endpoints.
 */

import { createLogger } from '../logger';

const logger = createLogger('nbaClient');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Referer': 'https://www.nba.com/',
  'Origin': 'https://www.nba.com'
};

const SCOREBOARD_URL = 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json';

export interface NbaGame {
  gameId: string;
  gameCode: string;
  gameStatus: number; // 1: Scheduled, 2: In Progress, 3: Final
  gameStatusText: string;
  gameTimeUTC: string;
  homeTeam: {
    teamId: number;
    teamTricode: string;
    score: number;
  };
  awayTeam: {
    teamId: number;
    teamTricode: string;
    score: number;
  };
}

export interface ScoreboardResponse {
  scoreboard: {
    gameDate: string;
    games: NbaGame[];
  };
}

/**
 * Generic fetch helper for NBA JSON endpoints.
 */
async function fetchNbaJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) {
      logger.warn({ url, status: response.status }, 'NBA API request failed');
      return null;
    }
    return response.json() as Promise<T>;
  } catch (err) {
    logger.error({ err, url }, 'Failed to fetch NBA data');
    return null;
  }
}

/**
 * Fetch today's scoreboard to get list of games.
 */
export async function getScoreboard(): Promise<ScoreboardResponse | null> {
  return fetchNbaJson<ScoreboardResponse>(SCOREBOARD_URL);
}

/**
 * Get list of today's games (scheduled, in progress, or final).
 */
export async function getLiveGames(): Promise<NbaGame[]> {
  const scoreboard = await getScoreboard();
  if (!scoreboard?.scoreboard?.games) {
    return [];
  }
  // Return all games: scheduled (1), in progress (2), and completed (3)
  return scoreboard.scoreboard.games;
}

/**
 * Fetch boxscore for a specific game.
 */
export async function fetchBoxscore(gameId: string): Promise<unknown | null> {
  const url = `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`;
  return fetchNbaJson(url);
}
