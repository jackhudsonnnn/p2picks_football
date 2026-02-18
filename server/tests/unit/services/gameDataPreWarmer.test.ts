/**
 * Tests for the game data pre-warmer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockGetGameStatus = vi.fn().mockResolvedValue({ status: 'scheduled' });
const mockGetHomeTeam = vi.fn().mockResolvedValue({ id: 'team-1', name: 'Home' });
const mockGetAwayTeam = vi.fn().mockResolvedValue({ id: 'team-2', name: 'Away' });
const mockHasProvider = vi.fn().mockReturnValue(true);

vi.mock('../../../src/services/leagueData', () => ({
  getGameStatus: (...args: any[]) => mockGetGameStatus(...args),
  getHomeTeam: (...args: any[]) => mockGetHomeTeam(...args),
  getAwayTeam: (...args: any[]) => mockGetAwayTeam(...args),
  hasLeagueProvider: (...args: any[]) => mockHasProvider(...args),
}));

vi.mock('../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { preWarmGameData } from '../../../src/services/bet/gameDataPreWarmer';

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('preWarmGameData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasProvider.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires requests for game status, home team, and away team', async () => {
    preWarmGameData('NFL', 'game-123');

    // Wait for the fire-and-forget async IIFE
    await new Promise((r) => setTimeout(r, 50));

    expect(mockGetGameStatus).toHaveBeenCalledWith('NFL', 'game-123');
    expect(mockGetHomeTeam).toHaveBeenCalledWith('NFL', 'game-123');
    expect(mockGetAwayTeam).toHaveBeenCalledWith('NFL', 'game-123');
  });

  it('skips when leagueGameId is empty', async () => {
    preWarmGameData('NFL', '');

    await new Promise((r) => setTimeout(r, 50));

    expect(mockGetGameStatus).not.toHaveBeenCalled();
  });

  it('skips when league has no provider (e.g. U2Pick)', async () => {
    mockHasProvider.mockReturnValue(false);

    preWarmGameData('U2Pick' as any, 'game-123');

    await new Promise((r) => setTimeout(r, 50));

    expect(mockGetGameStatus).not.toHaveBeenCalled();
  });

  it('does not throw when a league data call fails', async () => {
    mockGetGameStatus.mockRejectedValue(new Error('Network timeout'));

    expect(() => preWarmGameData('NFL', 'game-fail')).not.toThrow();

    await new Promise((r) => setTimeout(r, 50));

    // The call was attempted
    expect(mockGetGameStatus).toHaveBeenCalledWith('NFL', 'game-fail');
  });
});
