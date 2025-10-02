import { BetModeKey, BetRecord, BetStatus, Ticket } from './types';
import { modeRegistry } from './modes';
import { normalizeToHundredth } from '@shared/utils/number';

export function deriveBetState(bet: BetRecord): BetStatus {
  const s = (bet?.bet_status || 'active').toString().toLowerCase();
  if (s === 'active' || s === 'pending' || s === 'resolved' || s === 'washed') return s as BetStatus;
  return 'active';
}

export function getBetDescription(bet: BetRecord): string {
  if (!bet) return 'Bet';
  if (bet.description) return bet.description;
  const mode = (bet.mode_key ?? undefined) as BetModeKey | undefined;
  if (mode && mode in modeRegistry) {
    const def = modeRegistry[mode];
    return def.summary({ bet });
  }
  return 'Bet';
}

export function mapParticipationRowToTicket(row: any): Ticket {
  const bet = row.bet_proposals as BetRecord;
  const description = getBetDescription(bet);
  const closeTime = bet?.close_time ?? null;
  const betStatus = (bet?.bet_status as string) ?? 'active';
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
