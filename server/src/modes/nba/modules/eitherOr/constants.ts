import { NBA_STAT_KEY_TO_CATEGORY, NBA_STAT_KEY_LABELS } from '../../utils/statConstants';

export const NBA_EITHER_OR_MODE_KEY = 'nba_either_or';
export const NBA_EITHER_OR_LABEL = 'Either Or';
export const NBA_EITHER_OR_CHANNEL = 'nba-either-or-pending';
export const NBA_EITHER_OR_STORE_PREFIX = 'nbaEitherOr:baseline';
export const NBA_EITHER_OR_RESULT_EVENT = 'nba_either_or_result';
export const NBA_EITHER_OR_BASELINE_EVENT = 'nba_either_or_baseline';

export const NBA_EITHER_OR_STAT_KEY_TO_CATEGORY = NBA_STAT_KEY_TO_CATEGORY;
export const NBA_EITHER_OR_STAT_KEY_LABELS = NBA_STAT_KEY_LABELS;

export const NBA_EITHER_OR_PLAYER_STAT_MAP: Record<string, { category: string; field: string }> = {
	points: { category: 'stats', field: 'points' },
	rebounds: { category: 'stats', field: 'rebounds' },
	assists: { category: 'stats', field: 'assists' },
	steals: { category: 'stats', field: 'steals' },
	blocks: { category: 'stats', field: 'blocks' },
	turnovers: { category: 'stats', field: 'turnovers' },
	threePointersMade: { category: 'stats', field: 'threePointersMade' },
	freeThrowsMade: { category: 'stats', field: 'freeThrowsMade' },
};
