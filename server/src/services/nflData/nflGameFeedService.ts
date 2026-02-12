/**
 * Game Feed Service
 *
 * Watches refined NFL game JSON files and emits updates when they change.
 * Provides an in-memory cache and subscription mechanism for downstream
 * consumers to react to live game data without repeatedly reading from disk.
 */

import chokidar from 'chokidar';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import path from 'path';
import { getGameDoc, type RefinedGameDoc } from '../../data/nflRefinedDataAccessors';
import { createLogger } from '../../utils/logger';

const logger = createLogger('nflGameFeed');

export type NflGameFeedEvent = {
  gameId: string;
  doc: RefinedGameDoc;
  signature: string;
  updatedAt: string;
};

type NflGameFeedListener = (event: NflGameFeedEvent) => void;

interface CachedDoc {
  signature: string;
  doc: RefinedGameDoc;
  updatedAt: string;
}

const REFINED_DIR = path.join('src', 'data', 'nfl_data', 'nfl_refined_live_stats');
const GAME_UPDATE_EVENT = 'game-update';

class NflGameFeedService extends EventEmitter {
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
        logger.error({ error: err instanceof Error ? err.message : String(err) }, 'watcher error');
      });
  }

  stop(): void {
    if (this.watcher) {
  this.watcher.close().catch((err) => logger.error({ error: err instanceof Error ? err.message : String(err) }, 'close watcher error'));
      this.watcher = null;
    }
    this.started = false;
    this.cache.clear();
    this.processing.clear();
  }

  subscribe(listener: NflGameFeedListener, emitReplay = true): () => void {
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
      } satisfies NflGameFeedEvent);
    } catch (err) {
    logger.error({ gameId, error: err instanceof Error ? err.message : String(err) }, 'failed to process game file');
    }
  }

  private computeSignature(doc: RefinedGameDoc): string {
    const payload = {
      status: (doc as any)?.status ?? null,
      period: (doc as any)?.period ?? null,
      note: (doc as any)?.note ?? null,
      generatedAt: (doc as any)?.generatedAt ?? null,
      teams: Array.isArray(doc.teams)
        ? doc.teams.map((team: any) => ({
          teamId: team?.teamId ?? null,
          abbreviation: team?.abbreviation ?? null,
          score: team?.score ?? null,
          stats: team?.stats ?? null,
          possession: team?.possession ?? null,
          lastUpdated: team?.lastUpdated ?? null,
          players: summarizePlayers(team?.players),
        }))
        : [],
    };
    return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex');
  }
}

function summarizePlayers(rawPlayers: unknown): Array<{ athleteId: string | null; stats: any }> {
  const records: Array<{ athleteId: string | null; stats: any }> = [];
  const pushRecord = (player: any) => {
    if (!player) return;
    const athleteId =
      player?.athlete?.id ??
      player?.athleteId ??
      player?.id ??
      (typeof player?.fullName === 'string' ? player.fullName : null);
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

const service = new NflGameFeedService();

export function startNflGameFeedService(): void {
  service.start();
}

export function stopNflGameFeedService(): void {
  service.stop();
}

export function subscribeToNflGameFeed(
  listener: NflGameFeedListener,
  emitReplay = true,
): () => void {
  return service.subscribe(listener, emitReplay);
}

export function getCachedNflGameDoc(gameId: string): RefinedGameDoc | null {
  const cached = service.getCached(gameId);
  return cached ? cached.doc : null;
}

export function getCachedNflSignature(gameId: string): string | null {
  const cached = service.getCached(gameId);
  return cached ? cached.signature : null;
}
