/**
 * NBA API Client
 *
 * Uses a Python helper that wraps the `nba_api` package to fetch live game
 * data.
 */

import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../logger';
import { externalApiDurationMs } from '../../infrastructure/metrics';

const logger = createLogger('nbaClient');

const execFileAsync = promisify(execFile);
const PYTHON_EXEC = process.env.NBA_PYTHON_EXEC || 'python3.14';
const PYTHON_SCRIPT = path.resolve(__dirname, 'nba-data.py');

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
 * Run the Python nba-data helper and parse JSON output.
 */
async function runPythonJson<T>(args: string[]): Promise<T | null> {
  const start = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(PYTHON_EXEC, [PYTHON_SCRIPT, ...args], {
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const latencyMs = Date.now() - start;

    if (stderr) {
      logger.warn({ stderr: stderr.trim(), latencyMs }, 'NBA python helper emitted stderr');
    }

    logger.debug({ args, latencyMs }, 'NBA python helper completed');
    externalApiDurationMs.observe({ provider: 'nba', status: 'ok' }, latencyMs);
    return JSON.parse(stdout) as T;
  } catch (err) {
    const latencyMs = Date.now() - start;
    // If the python helper returned a structured error on stderr we may be able
    // to detect a known condition (like a missing boxscore) and handle it
    // gracefully. The python helper prints JSON to stderr on failure.
    try {
      const stderr = (err as any).stderr;
      if (stderr) {
        // Try parse JSON error emitted by the python helper
        const parsed = JSON.parse(stderr.toString());
        const msg = parsed?.error?.toString() ?? '';

        // If this was a boxscore request and the helper couldn't provide a
        // boxscore (often manifested as a JSON/parse error upstream), print
        // a friendly message and skip processing.
        if (args[0] === 'boxscore' && /Expecting value|No boxscore|not available/i.test(msg)) {
          return null;
        }
      }
    } catch (parseErr) {
      // fall through to generic error logging below
      logger.debug({ parseErr }, 'Failed to parse python helper stderr');
    }

    logger.error({ err, args, latencyMs }, 'NBA python helper failed');
    externalApiDurationMs.observe({ provider: 'nba', status: 'error' }, latencyMs);
    return null;
  }
}

/**
 * Fetch today's scoreboard to get list of games.
 */
export async function getScoreboard(): Promise<ScoreboardResponse | null> {
  return runPythonJson<ScoreboardResponse>(['scoreboard']);
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
  return runPythonJson(['boxscore', gameId]);
}
