import { getSupabaseAdmin, BetProposal } from '../supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type ModeConfigRecord = {
  mode_key: string;
  data: Record<string, unknown>;
};

interface CachedConfig extends ModeConfigRecord {
  expiresAt: number;
}

const memoryCache = new Map<string, CachedConfig>();

function setCache(betId: string, record: ModeConfigRecord) {
  memoryCache.set(betId, { ...record, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function storeModeConfig(betId: string, modeKey: string, data: Record<string, unknown>): Promise<void> {
  const supa = getSupabaseAdmin();
  const payload = { mode_key: modeKey, data };
  const { error } = await supa.from('resolution_history').insert([{ bet_id: betId, event_type: 'mode_config', payload }]);
  if (error) throw error;
  setCache(betId, { mode_key: modeKey, data });
}

export async function fetchModeConfig(betId: string): Promise<ModeConfigRecord | null> {
  const cached = memoryCache.get(betId);
  if (cached && cached.expiresAt > Date.now()) {
    return { mode_key: cached.mode_key, data: cached.data };
  }
  const supa = getSupabaseAdmin();
  const { data, error } = await supa
    .from('resolution_history')
    .select('payload')
    .eq('bet_id', betId)
    .eq('event_type', 'mode_config')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const payload = data && data[0]?.payload;
  if (!payload || typeof payload !== 'object') return null;
  const record: ModeConfigRecord = {
    mode_key: String(payload.mode_key || ''),
    data: (payload.data && typeof payload.data === 'object' ? payload.data : {}) as Record<string, unknown>,
  };
  if (!record.mode_key) return null;
  setCache(betId, record);
  return record;
}

export async function fetchModeConfigs(betIds: string[]): Promise<Record<string, ModeConfigRecord>> {
  const result: Record<string, ModeConfigRecord> = {};
  const missing: string[] = [];
  for (const betId of betIds) {
    const cached = memoryCache.get(betId);
    if (cached && cached.expiresAt > Date.now()) {
      result[betId] = { mode_key: cached.mode_key, data: cached.data };
    } else {
      missing.push(betId);
    }
  }
  if (missing.length === 0) return result;
  const supa = getSupabaseAdmin();
  const { data, error } = await supa
    .from('resolution_history')
    .select('bet_id, payload, created_at')
    .in('bet_id', missing)
    .eq('event_type', 'mode_config')
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (data) {
    for (const row of data) {
      const betId: string | undefined = row.bet_id;
      if (!betId || result[betId]) continue;
      const payload = row.payload;
      if (!payload || typeof payload !== 'object') continue;
      const modeKey = String(payload.mode_key || '');
      if (!modeKey) continue;
      const record: ModeConfigRecord = {
        mode_key: modeKey,
        data: (payload.data && typeof payload.data === 'object' ? payload.data : {}) as Record<string, unknown>,
      };
      setCache(betId, record);
      result[betId] = record;
    }
  }
  return result;
}

export async function ensureModeKeyMatchesBet(
  betId: string,
  modeKey?: string,
  client?: SupabaseClient,
): Promise<BetProposal> {
  const supabase = client ?? getSupabaseAdmin();
  const { data, error } = await supabase
    .from('bet_proposals')
    .select('*')
    .eq('bet_id', betId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(`bet ${betId} not found`);
  }
  const bet = data as BetProposal;
  if (modeKey && bet.mode_key && bet.mode_key !== modeKey) {
    throw new Error(`mode_key mismatch for bet ${betId}`);
  }
  if (!modeKey && !bet.mode_key) {
    throw new Error(`mode_key missing for bet ${betId}`);
  }
  return bet;
}