import type { ModeContext, ModeModule } from '../../shared/types';
import { chooseTheirFateValidator } from './validator';
import { prepareChooseTheirFateConfig } from './prepareConfig';
import { chooseTheirFateOverview } from './overview';
import { validateChooseTheirFateProposal } from './validateProposal';
import { getChooseTheirFateLiveInfo } from './liveInfo';

// ─────────────────────────────────────────────────────────────────────────────
// Type-safe mode functions
// ─────────────────────────────────────────────────────────────────────────────

function computeWinningCondition({ config }: ModeContext): string {
  const possessionTeam = config.possession_team_name || 'Offense';
  return `${possessionTeam}'s drive outcome`;
}

function computeOptions(): string[] {
  return ['pass', 'Touchdown', 'Field Goal', 'Safety', 'Punt', 'Turnover'];
}

// ─────────────────────────────────────────────────────────────────────────────
// Module definition
// ─────────────────────────────────────────────────────────────────────────────

export const chooseTheirFateModule: ModeModule = {
  definition: {
    key: 'choose_their_fate',
    label: 'Choose Their Fate',
    summaryTemplate: 'Choose Their Fate',
    computeWinningCondition,
    computeOptions,
    configSteps: [],
  },
  overview: chooseTheirFateOverview,
  prepareConfig: prepareChooseTheirFateConfig,
  validator: chooseTheirFateValidator,
  validateProposal: validateChooseTheirFateProposal,
  getLiveInfo: getChooseTheirFateLiveInfo,
};
