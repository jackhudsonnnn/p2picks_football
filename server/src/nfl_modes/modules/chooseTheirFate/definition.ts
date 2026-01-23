import type { ModeContext, ModeModule } from '../../shared/types';
import { chooseTheirFateValidator } from './validator';
import { prepareChooseTheirFateConfig } from './prepareConfig';
import { chooseTheirFateOverview } from './overview';
import { validateChooseTheirFateProposal } from './validateProposal';
import { getChooseTheirFateLiveInfo } from './liveInfo';
import {
  CHOOSE_THEIR_FATE_BASELINE_EVENT,
  CHOOSE_THEIR_FATE_LABEL,
  CHOOSE_THEIR_FATE_MODE_KEY,
  CHOOSE_THEIR_FATE_RESULT_EVENT,
} from './constants';
import { buildChooseTheirFateUserConfig } from './userConfig';

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
    key: CHOOSE_THEIR_FATE_MODE_KEY,
    label: CHOOSE_THEIR_FATE_LABEL,
    computeWinningCondition,
    computeOptions,
    configSteps: [],
    metadata: {
      baselineEvent: CHOOSE_THEIR_FATE_BASELINE_EVENT,
      resultEvent: CHOOSE_THEIR_FATE_RESULT_EVENT,
    },
  },
  overview: chooseTheirFateOverview,
  prepareConfig: prepareChooseTheirFateConfig,
  validator: chooseTheirFateValidator,
  validateProposal: validateChooseTheirFateProposal,
  buildUserConfig: buildChooseTheirFateUserConfig,
  getLiveInfo: getChooseTheirFateLiveInfo,
};
