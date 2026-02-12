/**
 * Mock Supabase Client for Testing
 *
 * Provides a mock implementation of SupabaseClient for unit tests.
 * Supports configurable responses and call tracking.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MockQueryResult<T = any> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

export interface MockRpcResult<T = any> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

export interface QueryCall {
  method: string;
  table?: string;
  args: any[];
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Query Builder
// ─────────────────────────────────────────────────────────────────────────────

export class MockQueryBuilder<T = any> {
  private _calls: QueryCall[] = [];
  private _result: MockQueryResult<T> = { data: null, error: null };
  private _singleResult: MockQueryResult<T> = { data: null, error: null };

  constructor(
    private table: string,
    private queryTracker: QueryCall[],
  ) {}

  /**
   * Configure the result for this query chain
   */
  setResult(data: T | null, error?: { message: string; code?: string } | null): this {
    this._result = { data, error: error ?? null };
    return this;
  }

  setSingleResult(data: T | null, error?: { message: string; code?: string } | null): this {
    this._singleResult = { data, error: error ?? null };
    return this;
  }

  private trackCall(method: string, ...args: any[]): this {
    const call: QueryCall = {
      method,
      table: this.table,
      args,
      timestamp: Date.now(),
    };
    this._calls.push(call);
    this.queryTracker.push(call);
    return this;
  }

  select(columns: string = '*'): this {
    return this.trackCall('select', columns);
  }

  insert(values: any[]): this {
    return this.trackCall('insert', values);
  }

  update(values: any): this {
    return this.trackCall('update', values);
  }

  delete(): this {
    return this.trackCall('delete');
  }

  eq(column: string, value: any): this {
    return this.trackCall('eq', column, value);
  }

  neq(column: string, value: any): this {
    return this.trackCall('neq', column, value);
  }

  in(column: string, values: any[]): this {
    return this.trackCall('in', column, values);
  }

  is(column: string, value: any): this {
    return this.trackCall('is', column, value);
  }

  or(filter: string): this {
    return this.trackCall('or', filter);
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    return this.trackCall('order', column, options);
  }

  limit(count: number): this {
    return this.trackCall('limit', count);
  }

  lte(column: string, value: any): this {
    return this.trackCall('lte', column, value);
  }

  gte(column: string, value: any): this {
    return this.trackCall('gte', column, value);
  }

  maybeSingle(): Promise<MockQueryResult<T>> {
    this.trackCall('maybeSingle');
    return Promise.resolve(this._singleResult.data !== null ? this._singleResult : this._result);
  }

  single(): Promise<MockQueryResult<T>> {
    this.trackCall('single');
    return Promise.resolve(this._singleResult.data !== null ? this._singleResult : this._result);
  }

  // Final resolution - returns the configured result
  then<TResult1 = MockQueryResult<T>>(
    onfulfilled?: (value: MockQueryResult<T>) => TResult1 | PromiseLike<TResult1>,
  ): Promise<TResult1> {
    const result = Promise.resolve(this._result);
    return onfulfilled ? result.then(onfulfilled) : (result as Promise<any>);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Supabase Client
// ─────────────────────────────────────────────────────────────────────────────

export class MockSupabaseClient {
  private _queryCalls: QueryCall[] = [];
  private _tableBuilders: Map<string, MockQueryBuilder> = new Map();
  private _rpcResults: Map<string, MockRpcResult> = new Map();

  /**
   * Get all tracked query calls
   */
  get calls(): QueryCall[] {
    return [...this._queryCalls];
  }

  /**
   * Clear all tracked calls
   */
  clearCalls(): void {
    this._queryCalls = [];
  }

  /**
   * Configure a mock result for a specific table
   */
  mockTable<T = any>(tableName: string): MockQueryBuilder<T> {
    const builder = new MockQueryBuilder<T>(tableName, this._queryCalls);
    this._tableBuilders.set(tableName, builder);
    return builder;
  }

  /**
   * Configure a mock result for an RPC call
   */
  mockRpc<T = any>(name: string, result: MockRpcResult<T>): void {
    this._rpcResults.set(name, result);
  }

  /**
   * Query a table (returns mock builder)
   */
  from(table: string): MockQueryBuilder {
    const existing = this._tableBuilders.get(table);
    if (existing) return existing;
    return new MockQueryBuilder(table, this._queryCalls);
  }

  /**
   * Call an RPC function
   */
  rpc(name: string, params?: any): Promise<MockRpcResult> {
    this._queryCalls.push({
      method: 'rpc',
      args: [name, params],
      timestamp: Date.now(),
    });
    const result = this._rpcResults.get(name) ?? { data: null, error: null };
    return Promise.resolve(result);
  }

  /**
   * Mock auth object
   */
  auth = {
    getUser: async () => ({
      data: { user: null },
      error: null,
    }),
  };
}

/**
 * Create a mock Supabase client for testing
 */
export function createMockSupabase(): MockSupabaseClient {
  return new MockSupabaseClient();
}

/**
 * Type assertion helper to use MockSupabaseClient where SupabaseClient is expected
 */
export function asMockSupabase(mock: MockSupabaseClient): SupabaseClient {
  return mock as unknown as SupabaseClient;
}
