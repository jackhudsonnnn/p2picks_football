import { getTotalScore } from '../../../../services/leagueData';
import type { League } from '../../../../types/league';
import { formatNumber, isApproximatelyEqual } from '../../../../utils/number';

export interface NbaTotalDisasterConfig {
  line?: string | null;
  line_value?: number | null;
  line_label?: string | null;
  home_team_id?: string | null;
  home_team_name?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  league_game_id?: string | null;
}

export interface NbaTotalDisasterEvaluationResult {
  totalPoints: number;
  line: number;
  decision: 'over' | 'under' | 'push';
}

export function normalizeLine(config: NbaTotalDisasterConfig): number | null {
  if (typeof config.line_value === 'number' && Number.isFinite(config.line_value)) {
    return config.line_value;
  }
  if (typeof config.line === 'string') {
    const parsed = Number.parseFloat(config.line);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function describeLine(config: NbaTotalDisasterConfig): string | null {
  const label = typeof config.line_label === 'string' ? config.line_label.trim() : '';
  if (label.length) return label;
  if (typeof config.line === 'string' && config.line.trim().length) {
    return config.line.trim();
  }
  if (typeof config.line_value === 'number' && Number.isFinite(config.line_value)) {
    return formatNumber(config.line_value);
  }
  return null;
}

export async function evaluateNbaTotalDisaster(league: League, gameId: string, line: number): Promise<NbaTotalDisasterEvaluationResult> {
  const totalPoints = await getTotalScore(league, gameId);
  if (isApproximatelyEqual(totalPoints, line)) {
    return {
      totalPoints,
      line,
      decision: 'push',
    };
  }
  return {
    totalPoints,
    line,
    decision: totalPoints > line ? 'over' : 'under',
  };
}
