// Thin re-exports to the new bets feature module to avoid breaking imports
export { getBetDescription, deriveBetState } from '../features/bets/mappers';
export type { BetRecord } from '../features/bets/types';
export function getCloseTime(bet: import('../features/bets/types').BetRecord): string | null {
  return bet?.close_time ?? null;
}
