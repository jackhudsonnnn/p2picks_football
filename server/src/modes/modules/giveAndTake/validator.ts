import { getSupabaseAdmin, type BetProposal } from '../../../supabaseClient';
import { fetchModeConfig } from '../../../services/modeConfig';
import { subscribeToGameFeed, type GameFeedEvent } from '../../../services/gameFeedService';
import { findTeam, type RefinedGameDoc } from '../../../helpers';

interface GiveAndTakeConfig {
  spread?: string | null;
  spread_value?: number | null;
  spread_label?: string | null;
  home_team_id?: string | null;
  home_team_name?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  nfl_game_id?: string | null;
}

export class GiveAndTakeValidatorService {
  private unsubscribe: (() => void) | null = null;
  private lastSignatureByGame = new Map<string, string>();
  private readonly modeLabel = 'Give And Take';

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = subscribeToGameFeed((event) => {
      void this.handleGameFeedEvent(event);
    });
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.lastSignatureByGame.clear();
  }

  private async handleGameFeedEvent(event: GameFeedEvent): Promise<void> {
    try {
      const { gameId, doc, signature } = event;
      if (this.lastSignatureByGame.get(gameId) === signature) return;
      this.lastSignatureByGame.set(gameId, signature);
      const status = String(doc.status || '').toUpperCase();
      if (status !== 'STATUS_FINAL') return;
      await this.processFinalGame(gameId, doc);
    } catch (err: unknown) {
      console.error('[giveAndTake] game feed error', { gameId: event.gameId }, err);
    }
  }

  private async processFinalGame(gameId: string, doc: RefinedGameDoc): Promise<void> {
    const supa = getSupabaseAdmin();
    const { data, error } = await supa
      .from('bet_proposals')
      .select('*')
      .eq('mode_key', 'give_and_take')
      .eq('bet_status', 'pending')
      .eq('nfl_game_id', gameId);
    if (error) {
      console.error('[giveAndTake] list pending bets error', { gameId }, error);
      return;
    }
    for (const row of (data as BetProposal[]) || []) {
      await this.resolveBet(row, doc);
    }
  }

  private async resolveBet(bet: BetProposal, doc: RefinedGameDoc): Promise<void> {
    try {
      const config = await this.getConfigForBet(bet.bet_id);
      if (!config) {
        console.warn('[giveAndTake] missing config; skipping bet', { bet_id: bet.bet_id });
        return;
      }
      const spread = this.normalizeSpread(config);
      if (spread == null) {
        const spreadLabel = this.describeSpread(config);
        await this.washBet(
          bet.bet_id,
          {
            outcome: 'wash',
            reason: 'invalid_spread',
            captured_at: new Date().toISOString(),
            config,
          },
          spreadLabel ? `Invalid spread value (${spreadLabel}).` : 'Invalid spread configuration.',
        );
        return;
      }

      const { homeTeam, awayTeam } = this.resolveTeams(doc, config);
      const homeScore = this.normalizeScore((homeTeam as any)?.score);
      const awayScore = this.normalizeScore((awayTeam as any)?.score);
      const adjustedHome = homeScore + spread;

      const homeChoice = this.choiceLabel(config.home_team_name, config.home_team_id, 'Home Team');
      const awayChoice = this.choiceLabel(config.away_team_name, config.away_team_id, 'Away Team');

      if (Math.abs(adjustedHome - awayScore) < 1e-9) {
        await this.washBet(
          bet.bet_id,
          {
            outcome: 'wash',
            reason: 'push',
            home_score: homeScore,
            away_score: awayScore,
            spread,
            captured_at: new Date().toISOString(),
          },
          `Adjusted home score matched away score (${this.formatNumber(adjustedHome)} vs ${this.formatNumber(awayScore)}).`,
        );
        return;
      }

      const winningChoice = adjustedHome > awayScore ? homeChoice : awayChoice;
      const supa = getSupabaseAdmin();
      const { error: updErr } = await supa
        .from('bet_proposals')
        .update({ winning_choice: winningChoice })
        .eq('bet_id', bet.bet_id)
        .is('winning_choice', null);
      if (updErr) {
        console.error('[giveAndTake] failed to set winning choice', { bet_id: bet.bet_id, winningChoice }, updErr);
        return;
      }

      await this.recordHistory(bet.bet_id, {
        outcome: winningChoice,
        home_score: homeScore,
        away_score: awayScore,
        adjusted_home: adjustedHome,
        spread,
        spread_label: config.spread_label ?? config.spread ?? null,
        captured_at: new Date().toISOString(),
      });
    } catch (err: unknown) {
      console.error('[giveAndTake] resolve bet error', { bet_id: bet.bet_id }, err);
    }
  }

  private resolveTeams(doc: RefinedGameDoc, config: GiveAndTakeConfig): { homeTeam: unknown; awayTeam: unknown } {
    const teams = Array.isArray(doc.teams) ? (doc.teams as any[]) : [];
    let home = this.lookupTeam(doc, config.home_team_id, config.home_team_name);
    if (!home && teams.length > 0) {
      home = teams.find((team: any) => String(team?.homeAway || '').toLowerCase() === 'home') ?? teams[0];
    }
    let away = this.lookupTeam(doc, config.away_team_id, config.away_team_name);
    if (!away && teams.length > 0) {
      away = teams.find((team: any) => String(team?.homeAway || '').toLowerCase() === 'away') ?? teams.find((team: any) => team !== home);
    }
    return { homeTeam: home, awayTeam: away };
  }

  private lookupTeam(doc: RefinedGameDoc, id?: string | null, name?: string | null) {
    if (id) {
      const team = findTeam(doc, id);
      if (team) return team;
    }
    if (name) {
      const target = String(name).trim().toLowerCase();
      if (target) {
        for (const team of doc.teams || []) {
          const name = String((team as any)?.name || '').trim().toLowerCase();
          const abbrev = String((team as any)?.abbreviation || '').trim().toLowerCase();
          if (name === target || abbrev === target) return team;
        }
      }
    }
    return null;
  }

  private normalizeScore(raw: unknown): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
      const num = Number(raw);
      if (Number.isFinite(num)) return num;
    }
    return 0;
  }

  private normalizeSpread(config: GiveAndTakeConfig): number | null {
    if (typeof config.spread_value === 'number' && Number.isFinite(config.spread_value)) {
      return config.spread_value;
    }
    if (typeof config.spread === 'string') {
      const parsed = Number.parseFloat(config.spread);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  private choiceLabel(name?: string | null, id?: string | null, fallback = 'Team'): string {
    if (name && String(name).trim().length) return String(name);
    if (id && String(id).trim().length) return String(id);
    return fallback;
  }

  private describeSpread(config: GiveAndTakeConfig): string | null {
    const label = typeof config.spread_label === 'string' ? config.spread_label.trim() : '';
    if (label.length) return label;
    if (typeof config.spread === 'string' && config.spread.trim().length) {
      return config.spread.trim();
    }
    if (typeof config.spread_value === 'number' && Number.isFinite(config.spread_value)) {
      return this.formatNumber(config.spread_value);
    }
    return null;
  }

  private formatNumber(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
    const fractional = Math.abs(value % 1) > 1e-9;
    const formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: fractional ? 1 : 0,
      maximumFractionDigits: fractional ? 1 : 0,
    });
    return formatter.format(value);
  }

  private formatBetLabel(betId: string): string {
    if (!betId) return 'UNKNOWN';
    const trimmed = betId.trim();
    if (!trimmed) return 'UNKNOWN';
    const short = trimmed.length > 8 ? trimmed.slice(0, 8) : trimmed;
    return short;
  }

  private async createWashSystemMessage(tableId: string, betId: string, explanation: string): Promise<void> {
    const supa = getSupabaseAdmin();
    const reason = explanation && explanation.trim().length ? explanation.trim() : 'See resolution history for details.';
    const message = `Bet #${this.formatBetLabel(betId)} washed\n\n${reason}`;
    try {
      const { error } = await supa.from('system_messages').insert([
        {
          table_id: tableId,
          message_text: message,
          generated_at: new Date().toISOString(),
        },
      ]);
      if (error) {
        console.error('[giveAndTake] failed to create wash system message', { betId, tableId }, error);
      }
    } catch (err: unknown) {
      console.error('[giveAndTake] wash system message error', { betId, tableId }, err);
    }
  }

  private async getConfigForBet(betId: string): Promise<GiveAndTakeConfig | null> {
    try {
      const record = await fetchModeConfig(betId);
      if (!record || record.mode_key !== 'give_and_take') return null;
      return record.data as GiveAndTakeConfig;
    } catch (err: unknown) {
      console.error('[giveAndTake] fetch config error', { betId }, err);
      return null;
    }
  }

  private async washBet(betId: string, payload: Record<string, unknown>, explanation: string): Promise<void> {
    try {
      const supa = getSupabaseAdmin();
      const updates = {
        bet_status: 'washed' as const,
        winning_choice: null as string | null,
        resolution_time: new Date().toISOString(),
      };
      const { data, error } = await supa
        .from('bet_proposals')
        .update(updates)
        .eq('bet_id', betId)
        .eq('bet_status', 'pending')
        .select('bet_id, table_id')
        .maybeSingle();
      if (error) {
        console.error('[giveAndTake] failed to wash bet', { betId }, error);
        return;
      }
      if (!data) {
        console.warn('[giveAndTake] wash skipped; bet not pending', { betId });
        return;
      }
      await this.recordHistory(betId, {
        ...payload,
        event: 'give_and_take_result',
      });
      if (!data.table_id) {
        console.warn('[giveAndTake] wash message skipped; table_id missing', { betId });
        return;
      }
      await this.createWashSystemMessage(data.table_id, betId, explanation);
    } catch (err: unknown) {
      console.error('[giveAndTake] wash bet error', { betId }, err);
    }
  }

  private async recordHistory(betId: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const supa = getSupabaseAdmin();
      const { error } = await supa
        .from('resolution_history')
        .insert([{ bet_id: betId, event_type: 'give_and_take_result', payload }]);
      if (error) {
        console.error('[giveAndTake] history record error', { betId }, error);
      }
    } catch (err: unknown) {
      console.error('[giveAndTake] history insert error', { betId }, err);
    }
  }
}

export const giveAndTakeValidator = new GiveAndTakeValidatorService();
