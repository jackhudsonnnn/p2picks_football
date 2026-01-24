import { getAllTeams, getCategory } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import { normalizeNumber } from '../../../../utils/number';

const league: League = 'NFL';

export interface ChooseTheirFateConfig {
	league_game_id?: string | null;
	home_team_id?: string | null;
	home_team_name?: string | null;
	away_team_id?: string | null;
	away_team_name?: string | null;
	possession_team_id?: string | null;
	possession_team_name?: string | null;
}

export interface ChooseFateTeamScores {
	key: string;
	teamId: string | null;
	abbreviation: string | null;
	homeAway: string | null;
	touchdowns: number;
	fieldGoals: number;
	safeties: number;
	punts: number;
	hasPossession: boolean;
}

export type ChooseFateScoreMap = Record<string, ChooseFateTeamScores>;

export interface ChooseFateBaseline {
	gameId: string;
	possessionTeamId: string;
	capturedAt: string;
	teams: ChooseFateScoreMap;
}

export type ChooseFateOutcome =
	| { outcome: 'Touchdown'; scoringTeamId: string }
	| { outcome: 'Field Goal'; scoringTeamId: string }
	| { outcome: 'Safety'; scoringTeamId: string; forcedByTeamId: string | null }
	| { outcome: 'Punt'; scoringTeamId: string; fromTeamId: string; toTeamId: string | null }
	| { outcome: 'Turnover'; scoringTeamId: string; fromTeamId: string; toTeamId: string | null };

export async function collectTeamScores(gameId: string): Promise<ChooseFateScoreMap> {
	const teams = await getAllTeams(league, gameId);
	if (!teams || teams.length === 0) {
		return {};
	}
	return buildTeamScoresFromTeams(teams);
}

export function buildTeamScoresFromTeams(teams: any[]): ChooseFateScoreMap {
	const scores: ChooseFateScoreMap = {};
	teams.forEach((team, index) => {
		const key = resolveTeamKey(team, index);
		const stats = ((team as any)?.stats ?? {}) as Record<string, Record<string, unknown>>;
		const scoring = getCategory(stats, 'scoring');
		const punting = getCategory(stats, 'punting');
		scores[key] = {
			key,
			teamId: team?.teamId,
			abbreviation: team?.abbreviation,
			homeAway:  team?.homeAway,
			touchdowns: readStat(scoring, ['touchdowns', 'Touchdowns']),
			fieldGoals: readStat(scoring, ['fieldGoals', 'FieldGoals', 'fgMade', 'made']),
			safeties: readStat(scoring, ['safeties', 'Safeties']),
			punts: readStat(punting, ['punts', 'Punts', 'attempts']),
			hasPossession: team?.possession,
		};
	});
	return scores;
}

export function determineChooseFateOutcome(
	baseline: ChooseFateBaseline,
	currentScores: ChooseFateScoreMap,
	reportedPossessionTeamId?: string | null,
): ChooseFateOutcome | null {
	if (!baseline) return null;

	const baselineDriveTeamId = baseline.possessionTeamId;
	const offenseId = baselineDriveTeamId ?? reportedPossessionTeamId ?? null;
	if (!offenseId) return null;

	const offenseKey = resolveTeamKeyFromMaps(currentScores, baseline.teams, offenseId);
	const offenseCurrent = getTeamScores(currentScores, offenseKey ?? offenseId) ?? createEmptyScores(offenseKey ?? offenseId);
	const offenseBaseline = getTeamScores(baseline.teams, offenseKey ?? offenseId) ?? createEmptyScores(offenseKey ?? offenseId);
	const scoringTeamId = baseline.possessionTeamId || offenseCurrent.teamId || offenseKey || offenseId;

	const offenseComparableId = normalizeComparable(scoringTeamId);
	const opponents = buildOpponentSnapshots(baseline.teams, currentScores, offenseComparableId);
	const primaryOpponent = opponents[0] ?? {
		key: 'opponent',
		current: createEmptyScores('opponent'),
		baseline: createEmptyScores('opponent'),
	};

	const offenseTouchdownDelta = statDelta(offenseCurrent, offenseBaseline, 'touchdowns');
	if (offenseTouchdownDelta > 0) {
		return { outcome: 'Touchdown', scoringTeamId };
	}

	const offenseFieldGoalDelta = statDelta(offenseCurrent, offenseBaseline, 'fieldGoals');
	if (offenseFieldGoalDelta > 0) {
		return { outcome: 'Field Goal', scoringTeamId };
	}

	const offenseSafetyDelta = statDelta(offenseCurrent, offenseBaseline, 'safeties');
	if (offenseSafetyDelta > 0) {
		return { outcome: 'Safety', scoringTeamId, forcedByTeamId: scoringTeamId };
	}

	const defensiveSafety = opponents.find((entry) => statDelta(entry.current, entry.baseline, 'safeties') > 0);
	if (defensiveSafety) {
		const forcingTeamId = defensiveSafety.current.teamId ?? defensiveSafety.baseline.teamId ?? defensiveSafety.key;
		return { outcome: 'Safety', scoringTeamId, forcedByTeamId: forcingTeamId ?? null };
	}

	const offensePuntDelta = statDelta(offenseCurrent, offenseBaseline, 'punts');
	if (offensePuntDelta > 0) {
		const recipient = deduceReceivingTeamId(scoringTeamId, opponents, reportedPossessionTeamId ?? null, currentScores);
		return {
			outcome: 'Punt',
			scoringTeamId,
			fromTeamId: scoringTeamId,
			toTeamId: recipient,
		};
	}

	const defensiveTouchdown = opponents.find((entry) => statDelta(entry.current, entry.baseline, 'touchdowns') > 0);
	if (defensiveTouchdown) {
		return buildTurnoverOutcome(scoringTeamId, opponents, reportedPossessionTeamId ?? null, currentScores, defensiveTouchdown);
	}

	const defensiveFieldGoal = opponents.find((entry) => statDelta(entry.current, entry.baseline, 'fieldGoals') > 0);
	if (defensiveFieldGoal) {
		return buildTurnoverOutcome(scoringTeamId, opponents, reportedPossessionTeamId ?? null, currentScores, defensiveFieldGoal);
	}

	const offenseLostPossession = detectPossessionLoss(
		offenseCurrent,
		offenseBaseline,
		scoringTeamId,
		reportedPossessionTeamId ?? null,
		currentScores,
	);
	if (offenseLostPossession) {
		return buildTurnoverOutcome(scoringTeamId, opponents, reportedPossessionTeamId ?? null, currentScores, primaryOpponent);
	}

	return null;
}

type OpponentSnapshot = {
	key: string;
	current: ChooseFateTeamScores;
	baseline: ChooseFateTeamScores;
};

type ChooseFateStatKey = 'touchdowns' | 'fieldGoals' | 'safeties' | 'punts';

function resolveTeamKey(team: unknown, fallbackIndex: number): string {
	const normalizedId = (team as any)?.teamId;
	if (normalizedId) return normalizedId;
	const normalizedAbbr = (team as any)?.abbreviation;
	if (normalizedAbbr) return normalizedAbbr;
	return `team_${fallbackIndex}`;
}

function readStat(bucket: Record<string, unknown> | undefined, keys: string | string[]): number {
	if (!bucket) return 0;
	const list = Array.isArray(keys) ? keys : [keys];
	for (const key of list) {
		if (Object.prototype.hasOwnProperty.call(bucket, key)) {
			return normalizeNumber(bucket[key]);
		}
		const lower = key.toLowerCase();
		const entry = Object.entries(bucket).find(([candidate]) => candidate.toLowerCase() === lower);
		if (entry) {
			return normalizeNumber(entry[1]);
		}
	}
	return 0;
}

function createEmptyScores(identifier?: string | null): ChooseFateTeamScores {
	const normalized = identifier ?? null;
	return {
		key: identifier ?? normalized ?? 'team',
		teamId: normalized,
		abbreviation: null,
		homeAway: null,
		touchdowns: 0,
		fieldGoals: 0,
		safeties: 0,
		punts: 0,
		hasPossession: false,
	};
}

function normalizeComparable(value: string | null | undefined): string | null {
	const normalized = value ?? null;
	return normalized ? normalized.toLowerCase() : null;
}

function resolveTeamKeyFromMaps(
	current: ChooseFateScoreMap,
	baseline: ChooseFateScoreMap,
	teamId: string | null,
): string | null {
	return findEntryKey(current, teamId) ?? findEntryKey(baseline, teamId) ?? teamId;
}

function findEntryKey(map: ChooseFateScoreMap, identifier: string | null): string | null {
	if (!identifier) return null;
	if (map[identifier]) return identifier;
	const target = normalizeComparable(identifier);
	if (!target) return null;
	for (const [key, entry] of Object.entries(map)) {
		const entryId = normalizeComparable(entry.teamId) ?? normalizeComparable(entry.abbreviation) ?? normalizeComparable(key);
		if (entryId && entryId === target) {
			return key;
		}
	}
	return null;
}

function getTeamScores(map: ChooseFateScoreMap, identifier: string | null): ChooseFateTeamScores | null {
	if (!identifier) return null;
	if (map[identifier]) return map[identifier];
	const target = normalizeComparable(identifier);
	if (!target) return null;
	for (const entry of Object.values(map)) {
		if (isSameTeam(entry, target)) return entry;
	}
	return null;
}

function isSameTeam(entry: ChooseFateTeamScores, normalizedId: string | null): boolean {
	if (!normalizedId) return false;
	return (
		normalizeComparable(entry.teamId) === normalizedId ||
		normalizeComparable(entry.abbreviation) === normalizedId ||
		normalizeComparable(entry.key) === normalizedId
	);
}

function buildOpponentSnapshots(
	baseline: ChooseFateScoreMap,
	current: ChooseFateScoreMap,
	offenseComparableId: string | null,
): OpponentSnapshot[] {
	const opponents: Record<string, OpponentSnapshot> = {};
	const register = (source: ChooseFateScoreMap, slot: 'current' | 'baseline') => {
		for (const [key, entry] of Object.entries(source)) {
			if (isSameTeam(entry, offenseComparableId)) continue;
			if (!opponents[key]) {
				opponents[key] = {
					key,
					current: createEmptyScores(key),
					baseline: createEmptyScores(key),
				};
			}
			if (slot === 'current') {
				opponents[key].current = entry;
			} else {
				opponents[key].baseline = entry;
			}
		}
	};
	register(current, 'current');
	register(baseline, 'baseline');
	return Object.values(opponents);
}

function statDelta(current: ChooseFateTeamScores, baseline: ChooseFateTeamScores, key: ChooseFateStatKey): number {
	const nextValue = current?.[key] ?? 0;
	const prevValue = baseline?.[key] ?? 0;
	return nextValue - prevValue;
}

function deduceReceivingTeamId(
	scoringTeamId: string,
	opponents: OpponentSnapshot[],
	reportedPossessionTeamId: string | null,
	currentScores: ChooseFateScoreMap,
): string | null {
	const offenseComparable = normalizeComparable(scoringTeamId);
	const possessingEntry = Object.values(currentScores).find(
		(entry) => entry.hasPossession && !isSameTeam(entry, offenseComparable),
	);
	if (possessingEntry) {
		return possessingEntry.teamId ?? possessingEntry.abbreviation ?? possessingEntry.key;
	}

	const reportedComparable = normalizeComparable(reportedPossessionTeamId ?? null);
	if (reportedPossessionTeamId && (!offenseComparable || reportedComparable !== offenseComparable)) {
		return reportedPossessionTeamId;
	}

	const opponent = opponents[0];
	if (opponent) {
		return opponent.current.teamId ?? opponent.baseline.teamId ?? opponent.key;
	}
	return null;
}

function buildTurnoverOutcome(
	scoringTeamId: string,
	opponents: OpponentSnapshot[],
	reportedPossessionTeamId: string | null,
	currentScores: ChooseFateScoreMap,
	preferred?: OpponentSnapshot,
): ChooseFateOutcome {
	const recipient =
		preferred?.current.teamId ??
		preferred?.baseline.teamId ??
		deduceReceivingTeamId(scoringTeamId, opponents, reportedPossessionTeamId, currentScores);
	return {
		outcome: 'Turnover',
		scoringTeamId,
		fromTeamId: scoringTeamId,
		toTeamId: recipient ?? null,
	};
}

function detectPossessionLoss(
	offenseCurrent: ChooseFateTeamScores,
	offenseBaseline: ChooseFateTeamScores,
	scoringTeamId: string,
	reportedPossessionTeamId: string | null,
	currentScores: ChooseFateScoreMap,
): boolean {
	const offenseComparable = normalizeComparable(scoringTeamId);
	const reportedComparable = normalizeComparable(reportedPossessionTeamId ?? null);
	const possessingEntry = Object.values(currentScores).find((entry) => entry.hasPossession);
	const possessingComparable = possessingEntry
		? normalizeComparable(possessingEntry.teamId ?? possessingEntry.abbreviation ?? possessingEntry.key)
		: null;

	if (possessingComparable && offenseComparable && possessingComparable !== offenseComparable) {
		return true;
	}
	if (reportedComparable && offenseComparable && reportedComparable !== offenseComparable) {
		return true;
	}
	const baselineHeldBall =
		typeof offenseBaseline.hasPossession === 'boolean' ? offenseBaseline.hasPossession : true;
	if (baselineHeldBall && !offenseCurrent.hasPossession) {
		return true;
	}
	return false;
}

