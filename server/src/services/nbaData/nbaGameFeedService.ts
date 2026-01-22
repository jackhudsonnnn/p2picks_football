/**
 * NBA Game Feed Service
 *
 * Watches refined NBA game JSON files and emits updates when they change.
 * Provides an in-memory cache and subscription mechanism for downstream
 * consumers to react to live game data without repeatedly reading from disk.
 */

import chokidar from 'chokidar';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import path from 'path';
import { getGameDoc, type RefinedNbaGame, type RefinedTeam } from './nbaRefinedDataAccessors';

export type GameFeedEvent = {
  gameId: string;
  doc: RefinedNbaGame;
  signature: string;
  updatedAt: string;
};

export type GameFeedListener = (event: GameFeedEvent) => void;

interface CachedDoc {
  signature: string;
  doc: RefinedNbaGame;
  updatedAt: string;
}

const REFINED_DIR = path.join('src', 'data', 'nba_data', 'nba_refined_live_stats');
const GAME_UPDATE_EVENT = 'game-update';

class NbaGameFeedService extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private started = false;
  private cache = new Map<string, CachedDoc>();
  private processing = new Map<string, Promise<void>>();

  start(): void {
    if (this.started) return;
    this.started = true;
    const dir = path.isAbsolute(REFINED_DIR) ? REFINED_DIR : path.join(process.cwd(), REFINED_DIR);
    this.watcher = chokidar
      .watch(path.join(dir, '*.json'), {
        ignoreInitial: false,
        awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
      })
      .on('add', (file) => {
        void this.processFile(path.basename(file, '.json'));
      })
      .on('change', (file) => {
        void this.processFile(path.basename(file, '.json'));
      })
      .on('error', (err) => {
        console.error('[nbaGameFeed] watcher error', err);
      });
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close().catch((err) => console.error('[nbaGameFeed] close watcher error', err));
      this.watcher = null;
    }
    this.started = false;
    this.cache.clear();
    this.processing.clear();
  }

  subscribe(listener: GameFeedListener, emitReplay = true): () => void {
    this.on(GAME_UPDATE_EVENT, listener);
    if (emitReplay) {
      queueMicrotask(() => {
        for (const [gameId, cached] of this.cache.entries()) {
          listener({
            gameId,
            doc: cached.doc,
            signature: cached.signature,
            updatedAt: cached.updatedAt,
          });
        }
      });
    }
    return () => {
      this.off(GAME_UPDATE_EVENT, listener);
    };
  }

  getCached(gameId: string): CachedDoc | undefined {
    return this.cache.get(gameId);
  }

  private async processFile(gameId: string): Promise<void> {
    const inFlight = this.processing.get(gameId);
    if (inFlight) {
      return inFlight;
    }
    const job = this.readAndEmit(gameId).finally(() => {
      this.processing.delete(gameId);
    });
    this.processing.set(gameId, job);
    return job;
  }

  private async readAndEmit(gameId: string): Promise<void> {
    try {
      const doc = await getGameDoc(gameId);
      if (!doc) return;
      const signature = this.computeSignature(doc);
      const cached = this.cache.get(gameId);
      if (cached && cached.signature === signature) {
        return;
      }
      const payload: CachedDoc = {
        signature,
        doc,
        updatedAt: new Date().toISOString(),
      };
      this.cache.set(gameId, payload);
      this.emit(GAME_UPDATE_EVENT, {
        gameId,
        doc,
        signature,
        updatedAt: payload.updatedAt,
      } satisfies GameFeedEvent);
    } catch (err) {
      console.error('[nbaGameFeed] failed to process game file', { gameId }, err);
    }
  }

  private computeSignature(doc: RefinedNbaGame): string {
    const payload = {
      status: doc.status ?? null,
      period: doc.period ?? null,
      gameClock: doc.gameClock ?? null,
      generatedAt: doc.generatedAt ?? null,
      teams: Array.isArray(doc.teams)
        ? doc.teams.map((team: RefinedTeam) => ({
            teamId: team.teamId ?? null,
            abbreviation: team.abbreviation ?? null,
            score: team.score ?? null,
            stats: team.stats ?? null,
            players: summarizePlayers(team.players),
          }))
        : [],
    };
    return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex');
  }
}

function summarizePlayers(
  rawPlayers: unknown
): Array<{ athleteId: string | null; stats: unknown }> {
  const records: Array<{ athleteId: string | null; stats: unknown }> = [];
  const pushRecord = (player: any) => {
    if (!player) return;
    const athleteId = player?.athleteId ?? player?.personId ?? null;
    records.push({
      athleteId: athleteId != null ? String(athleteId) : null,
      stats: player?.stats ?? null,
    });
  };

  if (Array.isArray(rawPlayers)) {
    rawPlayers.forEach(pushRecord);
  } else if (rawPlayers && typeof rawPlayers === 'object') {
    Object.values(rawPlayers as Record<string, unknown>).forEach(pushRecord);
  }

  return records;
}

const service = new NbaGameFeedService();

export function startNbaGameFeedService(): void {
  service.start();
}

export function stopNbaGameFeedService(): void {
  service.stop();
}

export function subscribeToNbaGameFeed(listener: GameFeedListener, emitReplay = true): () => void {
  return service.subscribe(listener, emitReplay);
}

export function getCachedNbaGameDoc(gameId: string): RefinedNbaGame | null {
  const cached = service.getCached(gameId);
  return cached ? cached.doc : null;
}

export function getCachedNbaSignature(gameId: string): string | null {
  const cached = service.getCached(gameId);
  return cached ? cached.signature : null;
}
