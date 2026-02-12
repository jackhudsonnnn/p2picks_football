/**
 * Spread Evaluator Tests
 *
 * Unit tests for the shared spread evaluation logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeSpread,
  describeSpread,
  evaluateSpread,
  type SpreadConfig,
} from '../../../src/leagues/sharedUtils/spreadEvaluator';

// Mock the leagueData service
vi.mock('../../../src/services/leagueData', () => ({
  listTeams: vi.fn(),
}));

import { listTeams } from '../../../src/services/leagueData';

describe('spreadEvaluator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeSpread', () => {
    it('should return spread_value when it is a valid number', () => {
      const config: SpreadConfig = { spread_value: -3.5 };
      expect(normalizeSpread(config)).toBe(-3.5);
    });

    it('should parse spread string when spread_value is not set', () => {
      const config: SpreadConfig = { spread: '-7' };
      expect(normalizeSpread(config)).toBe(-7);
    });

    it('should prefer spread_value over spread string', () => {
      const config: SpreadConfig = { spread_value: -3.5, spread: '-7' };
      expect(normalizeSpread(config)).toBe(-3.5);
    });

    it('should return null for invalid spread', () => {
      const config: SpreadConfig = { spread: 'invalid' };
      expect(normalizeSpread(config)).toBeNull();
    });

    it('should return null for empty config', () => {
      const config: SpreadConfig = {};
      expect(normalizeSpread(config)).toBeNull();
    });

    it('should handle zero spread', () => {
      const config: SpreadConfig = { spread_value: 0 };
      expect(normalizeSpread(config)).toBe(0);
    });

    it('should handle positive spreads', () => {
      const config: SpreadConfig = { spread_value: 3.5 };
      expect(normalizeSpread(config)).toBe(3.5);
    });
  });

  describe('describeSpread', () => {
    it('should return spread_label when available', () => {
      const config: SpreadConfig = {
        spread_label: 'HOM -3.5',
        spread_value: -3.5,
      };
      expect(describeSpread(config)).toBe('HOM -3.5');
    });

    it('should fall back to spread string', () => {
      const config: SpreadConfig = { spread: '-3.5' };
      expect(describeSpread(config)).toBe('-3.5');
    });

    it('should format spread_value as fallback', () => {
      const config: SpreadConfig = { spread_value: -3.5 };
      expect(describeSpread(config)).toBe('-3.5');
    });

    it('should return null for empty config', () => {
      const config: SpreadConfig = {};
      expect(describeSpread(config)).toBeNull();
    });

    it('should trim whitespace from labels', () => {
      const config: SpreadConfig = { spread_label: '  -3.5  ' };
      expect(describeSpread(config)).toBe('-3.5');
    });
  });

  describe('evaluateSpread', () => {
    it('should determine home team wins with spread', async () => {
      const mockTeams = [
        { teamId: '1', name: 'Home', homeAway: 'home', score: 28 },
        { teamId: '2', name: 'Away', homeAway: 'away', score: 21 },
      ];
      vi.mocked(listTeams).mockResolvedValue(mockTeams as any);

      const config: SpreadConfig = {
        league_game_id: '123',
        home_team_id: '1',
        away_team_id: '2',
      };

      // Home team: 28 + (-3.5) = 24.5 > 21 (away) -> home wins
      const result = await evaluateSpread(config, -3.5, 'NFL');

      expect(result.decision).toBe('home');
      expect(result.homeScore).toBe(28);
      expect(result.awayScore).toBe(21);
      expect(result.adjustedHomeScore).toBe(24.5);
    });

    it('should determine away team wins with spread', async () => {
      const mockTeams = [
        { teamId: '1', name: 'Home', homeAway: 'home', score: 21 },
        { teamId: '2', name: 'Away', homeAway: 'away', score: 28 },
      ];
      vi.mocked(listTeams).mockResolvedValue(mockTeams as any);

      const config: SpreadConfig = {
        league_game_id: '123',
        home_team_id: '1',
        away_team_id: '2',
      };

      // Home team: 21 + 3.5 = 24.5 < 28 (away) -> away wins
      const result = await evaluateSpread(config, 3.5, 'NFL');

      expect(result.decision).toBe('away');
      expect(result.homeScore).toBe(21);
      expect(result.awayScore).toBe(28);
      expect(result.adjustedHomeScore).toBe(24.5);
    });

    it('should detect a tie when adjusted scores are equal', async () => {
      const mockTeams = [
        { teamId: '1', name: 'Home', homeAway: 'home', score: 24 },
        { teamId: '2', name: 'Away', homeAway: 'away', score: 21 },
      ];
      vi.mocked(listTeams).mockResolvedValue(mockTeams as any);

      const config: SpreadConfig = {
        league_game_id: '123',
        home_team_id: '1',
        away_team_id: '2',
      };

      // Home team: 24 + (-3) = 21 === 21 (away) -> tie
      const result = await evaluateSpread(config, -3, 'NFL');

      expect(result.decision).toBe('tie');
      expect(result.adjustedHomeScore).toBe(21);
      expect(result.awayScore).toBe(21);
    });

    it('should work with NBA league', async () => {
      const mockTeams = [
        { teamId: '1', displayName: 'Lakers', homeAway: 'home', score: 110 },
        { teamId: '2', displayName: 'Celtics', homeAway: 'away', score: 105 },
      ];
      vi.mocked(listTeams).mockResolvedValue(mockTeams as any);

      const config: SpreadConfig = {
        league_game_id: '123',
        home_team_id: '1',
        away_team_id: '2',
      };

      const result = await evaluateSpread(config, -3.5, 'NBA');

      expect(result.decision).toBe('home');
      expect(listTeams).toHaveBeenCalledWith('NBA', '123');
    });
  });
});
