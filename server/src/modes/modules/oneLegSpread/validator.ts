import chokidar from 'chokidar';
import * as path from 'path';
import { getSupabase, BetProposal } from '../../../supabaseClient';
import { fetchModeConfig } from '../../../services/modeConfig';
import { loadRefinedGame, RefinedGameDoc, REFINED_DIR, findTeam } from '../../../helpers';

interface OneLegSpreadConfig {
  home_team_id?: string | null;
  home_team_name?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  nfl_game_id?: string | null;
}

export class OneLegSpreadValidatorService {
  private watcher: chokidar.FSWatcher | null = null;

  start() {
    this.startWatcher();
  }

  stop() {
    if (this.watcher) this.watcher.close().catch(() => {});
    this.watcher = null;
  }

  private startWatcher() {
    if (this.watcher) return;
    const dir = path.isAbsolute(REFINED_DIR) ? REFINED_DIR : path.join(process.cwd(), REFINED_DIR);
    console.log('[oneLegSpread] starting watcher on', dir);
    this.watcher = chokidar
      .watch(path.join(dir, '*.json'), { ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 } })
      .on('add', (file) => this.onFileChanged(file))
      .on('change', (file) => this.onFileChanged(file))
      .on('error', (err: unknown) => console.error('[oneLegSpread] watcher error', err));
  }

  private async onFileChanged(filePath: string) {
    const gameId = path.basename(filePath, '.json');
    try {
      const doc = await loadRefinedGame(gameId);
      if (!doc) return;
      const status = String(doc.status || '').toUpperCase();
      if (status !== 'STATUS_FINAL') return;
      await this.processFinalGame(gameId, doc);
    } catch (err: unknown) {
      console.error('[oneLegSpread] onFileChanged error', { filePath }, err);
    }
  }

  private async processFinalGame(gameId: string, doc: RefinedGameDoc) {
    const supa = getSupabase();
    const { data, error } = await supa
      .from('bet_proposals')
      .select('*')
      .eq('mode_key', 'one_leg_spread')
      .eq('bet_status', 'pending')
      .eq('nfl_game_id', gameId);
    if (error) {
      console.error('[oneLegSpread] list pending bets error', { gameId }, error);
      return;
    }
    for (const bet of (data as BetProposal[]) || []) {
      await this.resolveBet(bet, doc);
    }
  }

  private async resolveBet(bet: BetProposal, doc: RefinedGameDoc) {
    try {
      const config = await this.getConfigForBet(bet.bet_id);
      if (!config) {
        console.warn('[oneLegSpread] missing config; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const gameTeams = Array.isArray(doc.teams) ? (doc.teams as any[]) : [];
      if (gameTeams.length < 2) {
        console.warn('[oneLegSpread] insufficient teams in doc', { bet_id: bet.bet_id, teams: gameTeams.length });
        return;
      }
      const teamA = this.lookupTeam(doc, config.home_team_id, config.home_team_name) ?? gameTeams[0];
      const teamB = this.lookupTeam(doc, config.away_team_id, config.away_team_name) ?? gameTeams[1];
      const scoreA = this.normalizeScore((teamA as any)?.score);
      const scoreB = this.normalizeScore((teamB as any)?.score);
      const diff = Math.abs(scoreA - scoreB);
      const bucket = this.bucketForDiff(diff);
      const supa = getSupabase();
      const { error: updErr } = await supa
        .from('bet_proposals')
        .update({ winning_choice: bucket })
        .eq('bet_id', bet.bet_id)
        .is('winning_choice', null);
      if (updErr) {
        console.error('[oneLegSpread] failed to set winning_choice', { bet_id: bet.bet_id, bucket }, updErr);
        return;
      }
      await this.recordHistory(bet.bet_id, {
        outcome: 'winner',
        winning_choice: bucket,
        score_a: scoreA,
        score_b: scoreB,
        difference: diff,
        captured_at: new Date().toISOString(),
      });
    } catch (err: unknown) {
      console.error('[oneLegSpread] resolve bet error', { bet_id: bet.bet_id }, err);
    }
  }

  private lookupTeam(doc: RefinedGameDoc, id?: string | null, name?: string | null) {
    if (id) {
      const team = findTeam(doc, id);
      if (team) return team;
    }
    if (name) {
      const lower = String(name).toLowerCase();
      for (const team of doc.teams || []) {
        const display = String((team as any)?.displayName || '').toLowerCase();
        if (display === lower) return team;
      }
    }
    return null;
  }

  private normalizeScore(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
    return 0;
  }

  private bucketForDiff(diff: number): string {
    if (diff <= 3) return '0-3';
    if (diff <= 10) return '4-10';
    if (diff <= 25) return '11-25';
    return '26+';
  }

  private async getConfigForBet(betId: string): Promise<OneLegSpreadConfig | null> {
    try {
      const record = await fetchModeConfig(betId);
      if (!record || record.mode_key !== 'one_leg_spread') return null;
      return record.data as OneLegSpreadConfig;
    } catch (err: unknown) {
      console.error('[oneLegSpread] fetch config error', { betId }, err);
      return null;
    }
  }

  private async recordHistory(betId: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const supa = getSupabase();
      const { error } = await supa
        .from('resolution_history')
        .insert([{ bet_id: betId, event_type: 'one_leg_spread_result', payload }]);
      if (error) {
        console.error('[oneLegSpread] failed to record result', { betId }, error);
      }
    } catch (err: unknown) {
      console.error('[oneLegSpread] history record error', { betId }, err);
    }
  }
}

export const oneLegSpreadValidator = new OneLegSpreadValidatorService();
