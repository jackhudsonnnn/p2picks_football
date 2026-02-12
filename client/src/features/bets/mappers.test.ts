import { describe, it, expect } from 'vitest';
import { extractModeConfig, getBetDescription, mapParticipationRowToTicket } from './mappers';
import type { BetRecord } from './types';
import type { ParticipationRow } from '@data/repositories/betsRepository';

// ---------------------------------------------------------------------------
// extractModeConfig
// ---------------------------------------------------------------------------
describe('extractModeConfig', () => {
  it('returns undefined for null / undefined', () => {
    expect(extractModeConfig(null)).toBeUndefined();
    expect(extractModeConfig(undefined)).toBeUndefined();
  });

  it('returns mode_config directly when present', () => {
    const bet: BetRecord = {
      bet_id: '1',
      table_id: 't1',
      proposer_user_id: 'u1',
      mode_config: { foo: 'bar' },
    };
    expect(extractModeConfig(bet)).toEqual({ foo: 'bar' });
  });

  it('returns undefined when no config exists', () => {
    const bet: BetRecord = {
      bet_id: '1',
      table_id: 't1',
      proposer_user_id: 'u1',
    };
    expect(extractModeConfig(bet)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getBetDescription
// ---------------------------------------------------------------------------
describe('getBetDescription', () => {
  it('returns description when present', () => {
    const bet: BetRecord = {
      bet_id: '1',
      table_id: 't1',
      proposer_user_id: 'u1',
      description: 'Will the Bills win?',
    };
    expect(getBetDescription(bet)).toBe('Will the Bills win?');
  });

  it('falls back to mode_key formatted as title', () => {
    const bet: BetRecord = {
      bet_id: '1',
      table_id: 't1',
      proposer_user_id: 'u1',
      mode_key: 'over_under',
    };
    expect(getBetDescription(bet)).toBe('over under');
  });

  it('falls back to "Bet" when neither description nor mode_key', () => {
    const bet: BetRecord = {
      bet_id: '1',
      table_id: 't1',
      proposer_user_id: 'u1',
    };
    expect(getBetDescription(bet)).toBe('Bet');
  });
});

// ---------------------------------------------------------------------------
// mapParticipationRowToTicket
// ---------------------------------------------------------------------------
describe('mapParticipationRowToTicket', () => {
  const minimalRow: ParticipationRow = {
    participation_id: 'p1',
    bet_id: 'b1',
    table_id: 't1',
    user_id: 'u1',
    participation_time: '2025-01-01T00:00:00Z',
    user_guess: 'Over',
    bet_proposals: {
      bet_id: 'b1',
      table_id: 't1',
      proposer_user_id: 'u2',
      bet_status: 'active',
      wager_amount: 5,
      proposal_time: '2025-01-01T00:00:00Z',
      mode_key: 'spread',
      tables: { table_name: 'Table One' },
    },
  };

  it('maps basic fields correctly', () => {
    const ticket = mapParticipationRowToTicket(minimalRow);
    expect(ticket.id).toBe('p1');
    expect(ticket.betId).toBe('b1');
    expect(ticket.tableId).toBe('t1');
    expect(ticket.tableName).toBe('Table One');
    expect(ticket.myGuess).toBe('Over');
    expect(ticket.state).toBe('active');
    expect(ticket.wager).toBe(5);
    expect(ticket.payout).toBe(10);
    expect(ticket.settledStatus).toBe(false);
  });

  it('marks resolved tickets as settled', () => {
    const row: ParticipationRow = {
      ...minimalRow,
      bet_proposals: {
        ...minimalRow.bet_proposals!,
        bet_status: 'resolved',
        winning_choice: 'Over',
        resolution_time: '2025-01-02T00:00:00Z',
      },
    };
    const ticket = mapParticipationRowToTicket(row);
    expect(ticket.settledStatus).toBe(true);
    expect(ticket.state).toBe('resolved');
    expect(ticket.winningChoice).toBe('Over');
  });

  it('marks washed tickets as settled', () => {
    const row: ParticipationRow = {
      ...minimalRow,
      bet_proposals: {
        ...minimalRow.bet_proposals!,
        bet_status: 'washed',
      },
    };
    const ticket = mapParticipationRowToTicket(row);
    expect(ticket.settledStatus).toBe(true);
    expect(ticket.state).toBe('washed');
  });

  it('defaults myGuess to "No Entry" when null', () => {
    const row: ParticipationRow = {
      ...minimalRow,
      user_guess: null,
    };
    const ticket = mapParticipationRowToTicket(row);
    expect(ticket.myGuess).toBe('No Entry');
  });

  it('handles missing bet_proposals gracefully', () => {
    const row: ParticipationRow = {
      participation_id: 'p2',
      bet_id: 'b2',
      table_id: 't2',
      user_id: 'u1',
      participation_time: '2025-01-01T00:00:00Z',
      user_guess: null,
      bet_proposals: undefined as unknown as ParticipationRow['bet_proposals'],
    };
    const ticket = mapParticipationRowToTicket(row);
    expect(ticket.id).toBe('p2');
    expect(ticket.wager).toBe(0);
    expect(ticket.payout).toBe(0);
  });
});
