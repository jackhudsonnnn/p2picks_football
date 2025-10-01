import { getSupabase, BetProposal } from '../supabaseClient';
import { getTeamScoreStats } from '../get-functioins';
import { loadRefinedGame, REFINED_DIR, RefinedGameDoc } from '../helpers';
import chokidar from 'chokidar';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import * as path from 'path';

function pickWinningChoice(delta: { td: number; fg: number; sfty: number }): 'TD' | 'FG' | 'Safety' | null {
	if (delta.td > 0) return 'TD';
	if (delta.fg > 0) return 'FG';
	if (delta.sfty > 0) return 'Safety';
	return null;
}

interface AggregateTotals {
	touchdowns: number;
	fieldGoals: number;
	safeties: number;
	teamCount: number;
}

interface GameSnapshot {
	signatureJson: string;
	signatureHash: string;
	totals: AggregateTotals;
}

interface SnapshotRecord {
	shouldProcess: boolean;
	previousHash: string | null;
}

export class ScorcererValidatorService {
	private watcher: chokidar.FSWatcher | null = null;
	private redisClient: Redis | null = null;
	private redisInitAttempted = false;
	private readonly redisSnapshotTtlSeconds = 60 * 60 * 6;

	start() {
		// Watch-mode only: trigger validation when refined JSON files are added/changed
		this.startWatcher();
	}

	stop() {
		if (this.watcher) this.watcher.close().catch(() => {});
		this.watcher = null;
		if (this.redisClient) {
			this.redisClient.quit().catch((err: unknown) => console.error('[scorcerer] redis quit error', err));
			this.redisClient = null;
			this.redisInitAttempted = false;
		}
	}

	private startWatcher() {
		if (this.watcher) return;
		const dir = path.isAbsolute(REFINED_DIR) ? REFINED_DIR : path.join(process.cwd(), REFINED_DIR);
		console.log('[scorcerer] starting watcher on', dir);
		this.watcher = chokidar
			.watch(path.join(dir, '*.json'), { ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 } })
			.on('add', (file) => this.onFileChanged(file))
			.on('change', (file) => this.onFileChanged(file))
			.on('error', (err: unknown) => console.error('[scorcerer] watcher error', err));
	}

	private redisSnapshotKey(gameId: string): string {
		return `scorcerer:snapshot:${gameId}`;
	}

	private getRedis(): Redis | null {
		if (this.redisClient) return this.redisClient;
		if (this.redisInitAttempted) return this.redisClient;
		this.redisInitAttempted = true;
		const url = process.env.REDIS_URL;
		if (!url) {
			console.error('[scorcerer] redis url not configured; scorcerer validator requires Redis');
			return null;
		}
		try {
			const client = new Redis(url);
			client.on('error', (err: unknown) => console.error('[scorcerer] redis error', err));
			this.redisClient = client;
			console.log('[scorcerer] redis client initialized');
		} catch (err: unknown) {
			console.error('[scorcerer] failed to initialize redis client', err);
			this.redisClient = null;
		}
		return this.redisClient;
	}

	private async recordSnapshotSignature(gameId: string, snapshot: GameSnapshot): Promise<SnapshotRecord | null> {
		const redis = this.getRedis();
		if (!redis) return null;
		try {
			const key = this.redisSnapshotKey(gameId);
			const previous = await redis.getset(key, snapshot.signatureHash);
			await redis.expire(key, this.redisSnapshotTtlSeconds);
			return { shouldProcess: previous !== snapshot.signatureHash, previousHash: previous };
		} catch (err: unknown) {
			console.error('[scorcerer] redis snapshot error', err);
			return null;
		}
	}

	private async restoreSnapshotOnFailure(gameId: string, newHash: string, record: SnapshotRecord | null) {
		if (!record) return;
		const redis = this.getRedis();
		if (!redis) return;
		try {
			const key = this.redisSnapshotKey(gameId);
			const stored = await redis.get(key);
			if (stored === newHash) {
				if (record.previousHash) {
					await redis.set(key, record.previousHash, 'EX', this.redisSnapshotTtlSeconds);
				} else {
					await redis.del(key);
				}
			}
		} catch (err: unknown) {
			console.error('[scorcerer] failed to restore redis snapshot', err);
		}
	}

	private async invalidateSnapshot(gameId: string) {
		const redis = this.getRedis();
		if (!redis) return;
		try {
			await redis.del(this.redisSnapshotKey(gameId));
		} catch (err: unknown) {
			console.error('[scorcerer] failed to clear redis snapshot', err);
		}
	}

	private async onFileChanged(filePath: string) {
		const gameId = path.basename(filePath, '.json');
		let snapshot: GameSnapshot | null = null;
		let snapshotRecord: SnapshotRecord | null = null;
		try {
			const doc = await loadRefinedGame(gameId);
			if (!doc) {
				await this.invalidateSnapshot(gameId);
				return;
			}

			const builtSnapshot = await this.buildGameSnapshot(gameId, doc);
			snapshot = builtSnapshot;
			const record = await this.recordSnapshotSignature(gameId, builtSnapshot);
			snapshotRecord = record;
			if (!record) return;
			if (!record.shouldProcess) return;
			if (builtSnapshot.totals.teamCount === 0) return;

			const supa = getSupabase();
			const { data: bets, error } = await supa
				.from('bet_proposals')
				.select('*')
				.in('bet_status', ['active', 'pending'])
				.eq('mode_key', 'scorcerer')
				.is('winning_choice', null)
				.eq('nfl_game_id', gameId);
			if (error) {
				console.error('[scorcerer] list bets (watch) error', error);
				await this.restoreSnapshotOnFailure(gameId, builtSnapshot.signatureHash, record);
				return;
			}
			const group = (bets as BetProposal[]) || [];
			if (group.length === 0) return;

			await this.processGame(gameId, group, doc, builtSnapshot.totals);
		} catch (e: unknown) {
			console.error('[scorcerer] onFileChanged error', { filePath }, e);
			if (snapshot && snapshotRecord?.shouldProcess) {
				await this.restoreSnapshotOnFailure(gameId, snapshot.signatureHash, snapshotRecord);
			}
		}
	}

	private async buildGameSnapshot(gameId: string, doc: RefinedGameDoc): Promise<GameSnapshot> {
		const rawTeams: any[] = Array.isArray(doc.teams) ? (doc.teams as any[]) : [];
		const teamSnapshots: Array<{ key: string; touchdowns: number; fieldGoals: number; safeties: number }> = [];

		for (let idx = 0; idx < rawTeams.length; idx += 1) {
			const rawTeam: any = rawTeams[idx];
			const lookupId: string = String(rawTeam?.teamId || rawTeam?.abbreviation || '') || '';
			let stats = { score: 0, touchdowns: 0, fieldGoalsMade: 0, extraPointsMade: 0, safeties: 0 };
			if (lookupId) {
				stats = await getTeamScoreStats(gameId, lookupId, doc);
			}
			const teamKey = lookupId || `slot:${idx}`;
			teamSnapshots.push({
				key: teamKey,
				touchdowns: Number(stats.touchdowns || 0),
				fieldGoals: Number(stats.fieldGoalsMade || 0),
				safeties: Number(stats.safeties || 0),
			});
		}

		const normalizedStatus = String(doc.status || '').toUpperCase();
		const sortedTeams = teamSnapshots.slice().sort((a, b) => a.key.localeCompare(b.key));
		const signaturePayload = {
			status: normalizedStatus,
			teams: sortedTeams.map((t) => [t.key, t.touchdowns, t.fieldGoals, t.safeties]),
		};
		const totals = sortedTeams.reduce<AggregateTotals>(
			(acc, team) => {
				acc.touchdowns += team.touchdowns;
				acc.fieldGoals += team.fieldGoals;
				acc.safeties += team.safeties;
				acc.teamCount += 1;
				return acc;
			},
			{ touchdowns: 0, fieldGoals: 0, safeties: 0, teamCount: 0 },
		);

		const signatureJson = JSON.stringify(signaturePayload);
		const signatureHash = createHash('sha256').update(signatureJson).digest('hex');

		return { signatureJson, signatureHash, totals };
	}

	private async processGame(gameId: string, bets: BetProposal[], doc: RefinedGameDoc, totals: AggregateTotals) {
		if (totals.teamCount === 0) return;
		const totalTD = totals.touchdowns;
		const totalFG = totals.fieldGoals;
		const totalSF = totals.safeties;

		const supa = getSupabase();
		// For each bet, compare to its own baseline
		for (const b of bets) {
			// Load baseline for this bet
			const { data: rows, error: baseErr } = await supa
				.from('bet_mode_scorcerer')
				.select('baseline_touchdowns, baseline_field_goals, baseline_safeties')
				.eq('bet_id', b.bet_id)
				.limit(1);
			if (baseErr) {
				console.error('[scorcerer] baseline fetch error', { bet_id: b.bet_id }, baseErr);
				continue;
			}
			const base = rows && rows[0];
			if (!base) {
				// No baseline captured; skip to avoid false positives
				console.warn('[scorcerer] missing baseline; skipping bet', { bet_id: b.bet_id });
				continue;
			}
			const baseTD = Number((base as any).baseline_touchdowns || 0);
			const baseFG = Number((base as any).baseline_field_goals || 0);
			const baseSF = Number((base as any).baseline_safeties || 0);

			const delta = { td: totalTD - baseTD, fg: totalFG - baseFG, sfty: totalSF - baseSF };
			if (delta.td <= 0 && delta.fg <= 0 && delta.sfty <= 0) {
				// If no increase and game is final, set No More Scores
				const status = String(doc?.status || '');
				if (status.toUpperCase() === 'STATUS_FINAL') {
					const { error: updFinalErr } = await supa
						.from('bet_proposals')
						.update({ winning_choice: 'No More Scores' })
						.eq('bet_id', b.bet_id)
						.is('winning_choice', null);
					if (updFinalErr) {
						console.error('[scorcerer] failed to set No More Scores for final game', { bet_id: b.bet_id, gameId }, updFinalErr);
					} else {
						console.log('[scorcerer] No More Scores set (final game, no increases since baseline)', { bet_id: b.bet_id, gameId });
					}
				}
				continue;
			}
			const winning = pickWinningChoice({ td: delta.td, fg: delta.fg, sfty: delta.sfty });
			if (!winning) continue;

			const { error: updErr } = await supa
				.from('bet_proposals')
				.update({ winning_choice: winning })
				.eq('bet_id', b.bet_id)
				.is('winning_choice', null);
			if (updErr) {
				console.error('[scorcerer] failed to set winning_choice', { bet_id: b.bet_id, winning }, updErr);
			} else {
				console.log('[scorcerer] winning_choice set', { bet_id: b.bet_id, gameId, winning });
			}
		}
	}
}

export const scorcererValidator = new ScorcererValidatorService();

