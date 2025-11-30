import type Redis from 'ioredis';

export class RedisJsonStore<TRecord> {
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
    private readonly ttlSeconds: number,
  ) {}

  private key(id: string): string {
    return `${this.prefix}:${id}`;
  }

  async get(id: string): Promise<TRecord | null> {
    const raw = await this.redis.get(this.key(id));
    if (!raw) return null;
    return JSON.parse(raw) as TRecord;
  }

  async set(id: string, value: TRecord): Promise<void> {
    const key = this.key(id);
    const json = JSON.stringify(value);
    await this.redis.set(key, json, 'EX', this.ttlSeconds);
  }

  async delete(id: string): Promise<void> {
    await this.redis.del(this.key(id));
  }
}
