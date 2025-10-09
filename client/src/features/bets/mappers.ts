import { BetModeKey, BetRecord, BetStatus, Ticket } from './types';
import { normalizeToHundredth } from '@shared/utils/number';

export function extractModeConfig(bet?: BetRecord | null): Record<string, unknown> | undefined {
  if (!bet) return undefined;

  const direct = (bet as any).mode_config ?? (bet as any).modeConfig;
  if (direct && typeof direct === 'object') {
    return direct as Record<string, unknown>;
  }

  const modeKey = bet.mode_key ? String(bet.mode_key) : '';
  if (modeKey) {
    const legacyKey = `bet_mode_${modeKey}`;
    const legacy = (bet as any)[legacyKey];
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

export function deriveBetState(bet: BetRecord): BetStatus {
  const s = (bet?.bet_status || 'active').toString().toLowerCase();
  if (s === 'active' || s === 'pending' || s === 'resolved' || s === 'washed') return s as BetStatus;
  return 'active';
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

export function mapParticipationRowToTicket(row: any): Ticket {
  const bet = row.bet_proposals as BetRecord;
  const description = getBetDescription(bet);
  const closeTime = bet?.close_time ?? null;
  const betStatus = (bet?.bet_status as string) ?? 'active';
  const config = extractModeConfig(bet);
  if (config && !(bet as any).mode_config) {
    (bet as any).mode_config = config;
  }
  return {
    betId: bet?.bet_id,
    id: row.participation_id,
    tableId: row.table_id,
    tableName: (bet?.tables as any)?.table_name || '',
    createdAt: bet?.proposal_time || row.participation_time,
    closedAt: bet?.resolution_time ?? null,
    state: betStatus,
    gameContext: description,
    betDetails: description,
    myGuess: row.user_guess || 'pass',
    wager: bet?.wager_amount != null ? normalizeToHundredth(bet.wager_amount) : 0,
    payout: bet?.wager_amount ? normalizeToHundredth((bet.wager_amount as number) * 2) : 0,
    result: bet?.winning_choice ?? null,
    settledStatus: betStatus === 'resolved' || betStatus === 'washed',
    proposalTime: bet?.proposal_time ?? undefined,
    timeLimitSeconds: bet?.time_limit_seconds ?? undefined,
    modeKey: (bet?.mode_key as any) ?? undefined,
    betStatus,
    closeTime,
    winningChoice: bet?.winning_choice ?? null,
    resolutionTime: bet?.resolution_time ?? null,
    betRecord: bet,
  } as Ticket;
}
