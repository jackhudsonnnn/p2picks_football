/**
 * ESPN NFL API client.
 * Handles all HTTP requests to ESPN's public API endpoints.
 */

import { createLogger } from '../logger';

const logger = createLogger('espnClient');

const BASE_URL = 'http://site.api.espn.com/apis/site/v2/sports/football/nfl';
const SCOREBOARD_URL = `${BASE_URL}/scoreboard`;
const SUMMARY_URL_TMPL = `${BASE_URL}/summary?event={event_id}`;
const ROSTER_URL_TMPL = `${BASE_URL}/teams/{team_id}/roster`;

export interface ESPNEvent {
  id?: string;
  uid?: string;
  status?: {
    type?: {
      state?: string;
    };
  };
  [key: string]: unknown;
}

/**
 * Fetch JSON from a URL with standard headers.
 */
async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'p2picks-nfl-data/1.0',
      },
    });
    if (!res.ok) {
      logger.debug({ url, status: res.status }, 'Fetch failed');
      return null;
    }
    return res.json();
  } catch (err) {
    logger.debug({ url, err }, 'HTTP error');
    return null;
  }
}

/**
 * Fetch live/upcoming NFL events from the scoreboard.
 */
export async function getLiveEvents(): Promise<ESPNEvent[]> {
  const data = (await fetchJson(SCOREBOARD_URL)) as { events?: ESPNEvent[] } | null;
  if (!data) return [];
  const events = Array.isArray(data.events) ? data.events : [];
  return events.filter((event: ESPNEvent) => {
    const state = event?.status?.type?.state;
    return state === 'in' || state === 'pre';
  });
}

/**
 * Fetch boxscore/summary data for a specific game.
 */
export async function fetchBoxscore(eventId: string): Promise<unknown | null> {
  const summaryUrl = SUMMARY_URL_TMPL.replace('{event_id}', eventId);
  return fetchJson(summaryUrl);
}

/**
 * Fetch roster data for a specific team.
 */
export async function fetchRoster(teamId: string): Promise<unknown | null> {
  const url = ROSTER_URL_TMPL.replace('{team_id}', teamId);
  return fetchJson(url);
}
