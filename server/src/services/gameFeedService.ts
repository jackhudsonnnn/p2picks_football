import chokidar from 'chokidar';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import path from 'path';
import { loadRefinedGame, REFINED_DIR, type RefinedGameDoc } from '../helpers';

export type GameFeedEvent = {
  gameId: string;
  doc: RefinedGameDoc;
  signature: string;
  updatedAt: string;
};

export type GameFeedListener = (event: GameFeedEvent) => void;

interface CachedDoc {
  signature: string;
  doc: RefinedGameDoc;
  updatedAt: string;
}

const GAME_UPDATE_EVENT = 'game-update';

class GameFeedService extends EventEmitter {
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
        console.error('[gameFeed] watcher error', err);
      });
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close().catch((err) => console.error('[gameFeed] close watcher error', err));
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
      const doc = await loadRefinedGame(gameId);
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
      console.error('[gameFeed] failed to process game file', { gameId }, err);
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
            stats: team?.stats?.scoring ?? null,
            possession: team?.possession ?? null,
            lastUpdated: team?.lastUpdated ?? null,
          }))
        : [],
    };
    return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex');
  }
}

const service = new GameFeedService();

export function startGameFeedService(): void {
  service.start();
}

export function stopGameFeedService(): void {
  service.stop();
}

export function subscribeToGameFeed(listener: GameFeedListener, emitReplay = true): () => void {
  return service.subscribe(listener, emitReplay);
}

export function getCachedGameDoc(gameId: string): RefinedGameDoc | null {
  const cached = service.getCached(gameId);
  return cached ? cached.doc : null;
}

export function getCachedSignature(gameId: string): string | null {
  const cached = service.getCached(gameId);
  return cached ? cached.signature : null;
}
