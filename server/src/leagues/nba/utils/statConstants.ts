export const ALLOWED_RESOLVE_AT = ['Halftime', 'End of Game'] as const;
export const DEFAULT_RESOLVE_AT = 'End of Game';

export const NBA_STAT_KEY_TO_CATEGORY: Record<string, string> = {
	points: 'stats',
	rebounds: 'stats',
	assists: 'stats',
	steals: 'stats',
	blocks: 'stats',
	turnovers: 'stats',
	threePointersMade: 'stats',
	freeThrowsMade: 'stats',
};

export const NBA_STAT_KEY_LABELS: Record<string, string> = {
	points: 'Points',
	rebounds: 'Rebounds',
	assists: 'Assists',
	steals: 'Steals',
	blocks: 'Blocks',
	turnovers: 'Turnovers',
	threePointersMade: '3PM',
	freeThrowsMade: 'FTM',
};

export const NBA_STAT_KEY_RANGES: Record<string, { min: number; max: number; step: number }> = {
	points: { min: 0.5, max: 99.5, step: 0.5 },
	rebounds: { min: 0.5, max: 49.5, step: 0.5 },
	assists: { min: 0.5, max: 39.5, step: 0.5 },
	steals: { min: 0.5, max: 19.5, step: 0.5 },
	blocks: { min: 0.5, max: 19.5, step: 0.5 },
	turnovers: { min: 0.5, max: 29.5, step: 0.5 },
	threePointersMade: { min: 0.5, max: 29.5, step: 0.5 },
	freeThrowsMade: { min: 0.5, max: 39.5, step: 0.5 },
};

export const NBA_DEFAULT_STAT_RANGE = { min: 0.5, max: 99.5, step: 0.5 };

export function getNbaStatRange(statKey: string | null | undefined): { min: number; max: number; step: number } {
	if (!statKey) return NBA_DEFAULT_STAT_RANGE;
	return NBA_STAT_KEY_RANGES[statKey] || NBA_DEFAULT_STAT_RANGE;
}
