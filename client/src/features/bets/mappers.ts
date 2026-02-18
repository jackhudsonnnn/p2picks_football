import { BetModeKey, BetRecord, Ticket } from './types';
import { normalizeToHundredth } from '@shared/utils/number';
import type { ParticipationRow } from '@data/repositories/betsRepository';

export function extractModeConfig(bet?: BetRecord | null): Record<string, unknown> | undefined {
  if (!bet) return undefined;

  const direct = bet.mode_config;
  if (direct && typeof direct === 'object') {
    return direct as Record<string, unknown>;
  }

  const modeKey = bet.mode_key ? String(bet.mode_key) : '';
  if (modeKey) {
    const legacyKey = `bet_mode_${modeKey}` as keyof typeof bet;
    const legacy = bet[legacyKey];
    if (legacy) {
      return Array.isArray(legacy) ? (legacy[0] as Record<string, unknown>) : (legacy as Record<string, unknown>);
    }
  }

  const fallbackEntry = Object.entries(bet).find(([key, value]) => key.startsWith('bet_mode_') && value);
  if (fallbackEntry) {
    const [, value] = fallbackEntry;
    if (Array.isArray(value)) {
      const first = value[0];
      return first && typeof first === 'object' ? (first as Record<string, unknown>) : undefined;
    }
    if (typeof value === 'object') {
      return value as Record<string, unknown>;
    }
  }

  return undefined;
}

export function getBetDescription(bet: BetRecord): string {
  if (!bet) return 'Bet';
  const description = bet.description && String(bet.description).trim();
  if (description) return description;
  const mode = (bet.mode_key ?? undefined) as BetModeKey | undefined;
  if (mode) {
    return mode.replace(/_/g, ' ');
  }
  return 'Bet';
}

export function mapParticipationRowToTicket(row: ParticipationRow): Ticket {
  const bet = row.bet_proposals as BetRecord | undefined;
  const description = getBetDescription(bet ?? ({ bet_id: '', table_id: '', proposer_user_id: '' } as BetRecord));
  const closeTime = bet?.close_time ?? null;
  const betStatus = (bet?.bet_status as string) ?? 'active';
  const config = extractModeConfig(bet);
  if (config && bet && !bet.mode_config) {
    bet.mode_config = config;
  }
  return {
    betId: bet?.bet_id,
    id: row.participation_id,
    tableId: row.table_id,
    tableName: bet?.table_name || bet?.tables?.table_name || '',
    createdAt: bet?.proposal_time || row.participation_time,
    closedAt: bet?.resolution_time ?? null,
    state: betStatus,
    gameContext: description,
    betDetails: description,
    myGuess: row.user_guess || 'No Entry',
    wager: bet?.wager_amount != null ? normalizeToHundredth(bet.wager_amount) : 0,
    payout: bet?.wager_amount ? normalizeToHundredth((bet.wager_amount as number) * 2) : 0,
    result: bet?.winning_choice ?? null,
    settledStatus: betStatus === 'resolved' || betStatus === 'washed',
    proposalTime: bet?.proposal_time ?? undefined,
    timeLimitSeconds: bet?.time_limit_seconds ?? undefined,
    modeKey: bet?.mode_key ?? undefined,
    betStatus,
    closeTime,
    winningChoice: bet?.winning_choice ?? null,
    resolutionTime: bet?.resolution_time ?? null,
    betRecord: bet,
  };
}
