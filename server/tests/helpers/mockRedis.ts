/**
 * Mock Redis Client for Testing
 *
 * Provides an in-memory Redis mock for unit tests.
 * Supports the most common Redis operations used in the codebase.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MockRedisOptions {
  /** Initial key-value data */
  initialData?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Redis Client
// ─────────────────────────────────────────────────────────────────────────────

export class MockRedisClient {
  private store: Map<string, string> = new Map();
  private sortedSets: Map<string, Map<string, number>> = new Map();
  private expirations: Map<string, number> = new Map();
  private _calls: { method: string; args: any[] }[] = [];

  constructor(options?: MockRedisOptions) {
    if (options?.initialData) {
      for (const [key, value] of Object.entries(options.initialData)) {
        this.store.set(key, value);
      }
    }
  }

  /**
   * Get all recorded method calls
   */
  get calls() {
    return [...this._calls];
  }

  /**
   * Clear all recorded calls
   */
  clearCalls(): void {
    this._calls = [];
  }

  /**
   * Clear all data
   */
  flushall(): void {
    this.store.clear();
    this.sortedSets.clear();
    this.expirations.clear();
  }

  private track(method: string, ...args: any[]): void {
    this._calls.push({ method, args });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // String Operations
  // ─────────────────────────────────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    this.track('get', key);
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, ...args: any[]): Promise<'OK'> {
    this.track('set', key, value, ...args);
    this.store.set(key, value);
    
    // Handle EX option
    const exIndex = args.indexOf('EX');
    if (exIndex !== -1 && args[exIndex + 1]) {
      const seconds = parseInt(args[exIndex + 1], 10);
      this.expirations.set(key, Date.now() + seconds * 1000);
    }
    
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    this.track('del', ...keys);
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) deleted++;
      this.sortedSets.delete(key);
      this.expirations.delete(key);
    }
    return deleted;
  }

  async exists(...keys: string[]): Promise<number> {
    this.track('exists', ...keys);
    return keys.filter((k) => this.store.has(k) || this.sortedSets.has(k)).length;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.track('expire', key, seconds);
    if (this.store.has(key) || this.sortedSets.has(key)) {
      this.expirations.set(key, Date.now() + seconds * 1000);
      return 1;
    }
    return 0;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Sorted Set Operations
  // ─────────────────────────────────────────────────────────────────────────────

  async zadd(key: string, score: number, member: string): Promise<number> {
    this.track('zadd', key, score, member);
    let set = this.sortedSets.get(key);
    if (!set) {
      set = new Map();
      this.sortedSets.set(key, set);
    }
    const isNew = !set.has(member);
    set.set(member, score);
    return isNew ? 1 : 0;
  }

  async zcard(key: string): Promise<number> {
    this.track('zcard', key);
    return this.sortedSets.get(key)?.size ?? 0;
  }

  async zrange(key: string, start: number, stop: number, withScores?: string): Promise<string[]> {
    this.track('zrange', key, start, stop, withScores);
    const set = this.sortedSets.get(key);
    if (!set) return [];
    
    const entries = Array.from(set.entries()).sort((a, b) => a[1] - b[1]);
    const sliced = entries.slice(start, stop === -1 ? undefined : stop + 1);
    
    if (withScores === 'WITHSCORES') {
      return sliced.flatMap(([member, score]) => [member, String(score)]);
    }
    return sliced.map(([member]) => member);
  }

  async zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number> {
    this.track('zremrangebyscore', key, min, max);
    const set = this.sortedSets.get(key);
    if (!set) return 0;
    
    const minNum = typeof min === 'string' ? parseFloat(min) : min;
    const maxNum = typeof max === 'string' ? parseFloat(max) : max;
    
    let removed = 0;
    for (const [member, score] of set.entries()) {
      if (score >= minNum && score <= maxNum) {
        set.delete(member);
        removed++;
      }
    }
    return removed;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Pipeline Support
  // ─────────────────────────────────────────────────────────────────────────────

  pipeline(): MockPipeline {
    return new MockPipeline(this);
  }
}

class MockPipeline {
  private commands: { method: string; args: any[] }[] = [];

  constructor(private client: MockRedisClient) {}

  zadd(key: string, score: number, member: string): this {
    this.commands.push({ method: 'zadd', args: [key, score, member] });
    return this;
  }

  zcard(key: string): this {
    this.commands.push({ method: 'zcard', args: [key] });
    return this;
  }

  zremrangebyscore(key: string, min: number | string, max: number | string): this {
    this.commands.push({ method: 'zremrangebyscore', args: [key, min, max] });
    return this;
  }

  expire(key: string, seconds: number): this {
    this.commands.push({ method: 'expire', args: [key, seconds] });
    return this;
  }

  async exec(): Promise<[Error | null, any][]> {
    const results: [Error | null, any][] = [];
    for (const cmd of this.commands) {
      try {
        const method = (this.client as any)[cmd.method];
        if (typeof method === 'function') {
          const result = await method.apply(this.client, cmd.args);
          results.push([null, result]);
        } else {
          results.push([null, null]);
        }
      } catch (err) {
        results.push([err as Error, null]);
      }
    }
    return results;
  }
}

/**
 * Create a mock Redis client for testing
 */
export function createMockRedis(options?: MockRedisOptions): MockRedisClient {
  return new MockRedisClient(options);
}
