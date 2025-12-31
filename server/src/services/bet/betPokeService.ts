import { getSupabaseAdmin, type BetProposal } from '../../supabaseClient';

const EVENT_POKE_SPAWNED = 'bet_poke_spawned';
const EVENT_POKE_ORIGIN = 'bet_poke_origin';

type ResolutionHistoryRow = {
  payload?: Record<string, unknown> | null;
};

type BetPokePayload = {
  new_bet_id?: string | null;
  source_bet_id?: string | null;
};

function extractString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function recordBetPokeLink(sourceBetId: string, newBetId: string): Promise<void> {
  if (!sourceBetId || !newBetId) return;
  const supabase = getSupabaseAdmin();
  const rows = [
    {
      bet_id: sourceBetId,
      event_type: EVENT_POKE_SPAWNED,
      payload: { new_bet_id: newBetId },
    },
    {
      bet_id: newBetId,
      event_type: EVENT_POKE_ORIGIN,
      payload: { source_bet_id: sourceBetId },
    },
  ];
  const { error } = await supabase.from('resolution_history').insert(rows);
  if (error) {
    throw error;
  }
}

export async function listPokeChildren(sourceBetId: string): Promise<string[]> {
  if (!sourceBetId) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('resolution_history')
    .select('payload')
    .eq('bet_id', sourceBetId)
    .eq('event_type', EVENT_POKE_SPAWNED);
  if (error) {
    throw error;
  }
  const ids = new Set<string>();
  for (const row of (data as ResolutionHistoryRow[]) ?? []) {
    const payload = (row?.payload ?? null) as BetPokePayload | null;
    const candidate = extractString(payload?.new_bet_id);
    if (candidate) {
      ids.add(candidate);
    }
  }
  return Array.from(ids);
}

export async function fetchActivePokeChildren(sourceBetId: string): Promise<BetProposal[]> {
  const childIds = await listPokeChildren(sourceBetId);
  if (!childIds.length) {
    return [];
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('bet_proposals')
    .select('*')
    .in('bet_id', childIds)
    .eq('bet_status', 'active');
  if (error) {
    throw error;
  }
  return ((data as BetProposal[]) ?? []).filter((row) => Boolean(row?.bet_id));
}

export async function fetchPokeOrigin(betId: string): Promise<string | null> {
  if (!betId) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('resolution_history')
    .select('payload')
    .eq('bet_id', betId)
    .eq('event_type', EVENT_POKE_ORIGIN)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    throw error;
  }
  const row = (data as ResolutionHistoryRow[] | null)?.[0] ?? null;
  if (!row?.payload || typeof row.payload !== 'object') return null;
  return extractString((row.payload as BetPokePayload).source_bet_id);
}
