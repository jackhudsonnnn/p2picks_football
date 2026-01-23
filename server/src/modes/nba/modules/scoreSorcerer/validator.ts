import type { ModeValidator } from '../../../types';
import {
  getHomeScore,
  getAwayScore,
  getHomeTeam,
  getAwayTeam,
  getGameStatus,
  extractTeamId,
  extractTeamName,
  extractTeamAbbreviation,
} from '../../../../services/leagueData';
import type { League } from '../../../../types/league';

const league: League = 'NBA';

import { RedisJsonStore } from '../../../nfl/shared/redisJsonStore';
import { getRedisClient } from '../../../../utils/redisClient';
import {
  NBA_SCORE_SORCERER_CHANNEL,
  NBA_SCORE_SORCERER_LABEL,
  NBA_SCORE_SORCERER_MODE_KEY,
  NBA_SCORE_SORCERER_STORE_PREFIX,
} from './constants';
import type {
  NbaScoreSorcererBaseline,
  NbaScoreSorcererConfig,
} from './evaluator';
import {
  evaluateNbaScoreSorcerer,
  homeChoiceLabel,
  awayChoiceLabel,
} from './evaluator';

/**
 * NBA Score Sorcerer Validator
 *
 * Placeholder validator that logs start/stop.
 * Full implementation would subscribe to NBA game feed and evaluate bets.
 */
class NbaScoreSorcererValidatorService implements ModeValidator {
  private started = false;
  private store: RedisJsonStore<NbaScoreSorcererBaseline>;

  constructor() {
    const redis = getRedisClient();
    this.store = new RedisJsonStore<NbaScoreSorcererBaseline>(
      redis,
      NBA_SCORE_SORCERER_STORE_PREFIX,
      60 * 60 * 12
    );
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    console.log(`[${NBA_SCORE_SORCERER_MODE_KEY}] Validator started`);
    // TODO: Subscribe to NBA game feed and pending bets channel
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    console.log(`[${NBA_SCORE_SORCERER_MODE_KEY}] Validator stopped`);
  }
}

export const nbaScoreSorcererValidator = new NbaScoreSorcererValidatorService();
