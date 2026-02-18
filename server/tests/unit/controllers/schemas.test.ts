/**
 * Tests for controller request schemas
 */

import { describe, it, expect } from 'vitest';
import {
  uuidString,
  tableIdParams,
  betIdParams,
  friendRequestActionParams,
  createBetProposalBody,
  validateBetBody,
  sendMessageBody,
  addFriendBody,
  createSessionBody,
  applySessionChoiceBody,
  updateSessionGeneralBody,
  updateBetModeConfigBody,
  batchModeConfigBody,
} from '../../../src/controllers/schemas';

// ─────────────────────────────────────────────────────────────────────────────
// UUID validation
// ─────────────────────────────────────────────────────────────────────────────

describe('uuidString', () => {
  it('accepts a valid v4 UUID', () => {
    expect(uuidString.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
  });

  it('rejects a plain string', () => {
    expect(uuidString.safeParse('hello').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(uuidString.safeParse('').success).toBe(false);
  });

  it('rejects UUID with injection suffix', () => {
    expect(uuidString.safeParse('550e8400-e29b-41d4-a716-446655440000; DROP TABLE').success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Param schemas
// ─────────────────────────────────────────────────────────────────────────────

describe('tableIdParams', () => {
  it('accepts valid tableId', () => {
    expect(tableIdParams.safeParse({ tableId: '550e8400-e29b-41d4-a716-446655440000' }).success).toBe(true);
  });

  it('rejects missing tableId', () => {
    expect(tableIdParams.safeParse({}).success).toBe(false);
  });
});

describe('betIdParams', () => {
  it('accepts valid betId', () => {
    expect(betIdParams.safeParse({ betId: '550e8400-e29b-41d4-a716-446655440000' }).success).toBe(true);
  });
});

describe('friendRequestActionParams', () => {
  it('accepts valid action', () => {
    expect(
      friendRequestActionParams.safeParse({
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        action: 'accept',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid action', () => {
    expect(
      friendRequestActionParams.safeParse({
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        action: 'block',
      }).success,
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Body schemas — Bets
// ─────────────────────────────────────────────────────────────────────────────

describe('createBetProposalBody', () => {
  const valid = {
    proposer_user_id: '550e8400-e29b-41d4-a716-446655440000',
    wager_amount: 1,
    time_limit_seconds: 60,
  };

  it('accepts valid payload', () => {
    expect(createBetProposalBody.safeParse(valid).success).toBe(true);
  });

  it('requires proposer_user_id as UUID', () => {
    expect(createBetProposalBody.safeParse({ ...valid, proposer_user_id: 'not-uuid' }).success).toBe(false);
  });

  it('rejects wager_amount below minimum', () => {
    expect(createBetProposalBody.safeParse({ ...valid, wager_amount: 0.01 }).success).toBe(false);
  });

  it('rejects wager_amount above maximum', () => {
    expect(createBetProposalBody.safeParse({ ...valid, wager_amount: 100 }).success).toBe(false);
  });

  it('rejects time_limit_seconds below minimum', () => {
    expect(createBetProposalBody.safeParse({ ...valid, time_limit_seconds: 5 }).success).toBe(false);
  });

  it('rejects time_limit_seconds above maximum', () => {
    expect(createBetProposalBody.safeParse({ ...valid, time_limit_seconds: 999 }).success).toBe(false);
  });

  it('defaults league to U2Pick when omitted', () => {
    const result = createBetProposalBody.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.league).toBe('U2Pick');
    }
  });

  it('allows optional mode_config as record', () => {
    const result = createBetProposalBody.safeParse({ ...valid, mode_config: { foo: 'bar' } });
    expect(result.success).toBe(true);
  });
});

describe('validateBetBody', () => {
  it('accepts non-empty winning_choice', () => {
    expect(validateBetBody.safeParse({ winning_choice: 'option_a' }).success).toBe(true);
  });

  it('rejects empty winning_choice', () => {
    expect(validateBetBody.safeParse({ winning_choice: '' }).success).toBe(false);
  });

  it('rejects missing winning_choice', () => {
    expect(validateBetBody.safeParse({}).success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Body schemas — Messages
// ─────────────────────────────────────────────────────────────────────────────

describe('sendMessageBody', () => {
  it('accepts valid message', () => {
    expect(sendMessageBody.safeParse({ message: 'hello' }).success).toBe(true);
  });

  it('rejects empty message', () => {
    expect(sendMessageBody.safeParse({ message: '' }).success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Body schemas — Friends
// ─────────────────────────────────────────────────────────────────────────────

describe('addFriendBody', () => {
  it('accepts non-empty username', () => {
    expect(addFriendBody.safeParse({ username: 'alice' }).success).toBe(true);
  });

  it('rejects empty username', () => {
    expect(addFriendBody.safeParse({ username: '' }).success).toBe(false);
  });

  it('rejects missing username', () => {
    expect(addFriendBody.safeParse({}).success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Body schemas — Sessions
// ─────────────────────────────────────────────────────────────────────────────

describe('createSessionBody', () => {
  it('accepts valid session creation', () => {
    expect(
      createSessionBody.safeParse({
        mode_key: 'spread',
        league_game_id: '401547417',
        league: 'NFL',
      }).success,
    ).toBe(true);
  });

  it('rejects missing mode_key', () => {
    expect(
      createSessionBody.safeParse({ league_game_id: '401547417', league: 'NFL' }).success,
    ).toBe(false);
  });
});

describe('applySessionChoiceBody', () => {
  it('accepts valid choice', () => {
    expect(applySessionChoiceBody.safeParse({ step_key: 'team', choice_id: 'chiefs' }).success).toBe(true);
  });

  it('rejects missing step_key', () => {
    expect(applySessionChoiceBody.safeParse({ choice_id: 'chiefs' }).success).toBe(false);
  });
});

describe('updateSessionGeneralBody', () => {
  it('accepts valid wager and time limit', () => {
    expect(
      updateSessionGeneralBody.safeParse({ wager_amount: 1, time_limit_seconds: 60 }).success,
    ).toBe(true);
  });

  it('accepts empty body (all optional)', () => {
    expect(updateSessionGeneralBody.safeParse({}).success).toBe(true);
  });

  it('rejects out-of-range wager', () => {
    expect(updateSessionGeneralBody.safeParse({ wager_amount: 100 }).success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Body schemas — Mode config
// ─────────────────────────────────────────────────────────────────────────────

describe('updateBetModeConfigBody', () => {
  it('accepts valid payload', () => {
    expect(updateBetModeConfigBody.safeParse({ data: { key: 'val' } }).success).toBe(true);
  });

  it('rejects missing data', () => {
    expect(updateBetModeConfigBody.safeParse({}).success).toBe(false);
  });
});

describe('batchModeConfigBody', () => {
  it('accepts array of UUIDs', () => {
    expect(
      batchModeConfigBody.safeParse({
        betIds: ['550e8400-e29b-41d4-a716-446655440000'],
      }).success,
    ).toBe(true);
  });

  it('rejects empty array', () => {
    expect(batchModeConfigBody.safeParse({ betIds: [] }).success).toBe(false);
  });

  it('rejects non-UUID strings in array', () => {
    expect(batchModeConfigBody.safeParse({ betIds: ['not-a-uuid'] }).success).toBe(false);
  });
});
