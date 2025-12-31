import type { RefinedGameDoc } from '../../../services/nflRefinedDataService';
import { computeTotalPoints } from '../../shared/teamUtils';
import { formatNumber, isApproximatelyEqual } from '../../../utils/number';

export interface TotalDisasterConfig {
  line?: string | null;
  line_value?: number | null;
  line_label?: string | null;
  home_team_id?: string | null;
  home_team_name?: string | null;
  away_team_id?: string | null;
  away_team_name?: string | null;
  nfl_game_id?: string | null;
}

export interface TotalDisasterEvaluationResult {
  totalPoints: number;
  line: number;
  decision: 'over' | 'under' | 'push';
}

export function normalizeLine(config: TotalDisasterConfig): number | null {
  if (typeof config.line_value === 'number' && Number.isFinite(config.line_value)) {
    return config.line_value;
  }
  if (typeof config.line === 'string') {
    const parsed = Number.parseFloat(config.line);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function describeLine(config: TotalDisasterConfig): string | null {
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

export function evaluateTotalDisaster(doc: RefinedGameDoc, line: number): TotalDisasterEvaluationResult {
  const totalPoints = computeTotalPoints(doc);
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
