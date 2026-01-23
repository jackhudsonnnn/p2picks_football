import { getHomeTeamName } from '../../../services/nflData/nflRefinedDataAccessors';
import type { BuildUserConfigInput, ModeUserConfigChoice, ModeUserConfigStep } from '../../shared/types';
import { shouldSkipResolveStep } from '../../shared/resolveUtils';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT } from '../../shared/statConstants';
import { MAX_MAGNITUDE, MIN_MAGNITUDE, STEP } from './constants';
import { resolveGameId } from '../../../utils/gameId';

export async function buildSpreadTheWealthUserConfig(input: BuildUserConfigInput): Promise<ModeUserConfigStep[]> {
  const gameId = resolveGameId(input) ?? '';
  const title = 'Select Point Spread';
  const homeLabel = await getHomeTeamName(gameId);
  const skipResolveStep = await shouldSkipResolveStep(gameId);
  const choices: ModeUserConfigChoice[] = buildSpreadChoices(homeLabel, skipResolveStep);

  const steps: ModeUserConfigStep[] = [
    {
      key: 'spread',
      title,
      inputType: 'select',
      choices,
    },
  ];

  if (!skipResolveStep) {
    steps.push({
      key: 'resolve_at',
      title: 'Resolve At',
      inputType: 'select',
      choices: buildResolveChoices(),
    });
  }

  return steps;
}

function buildSpreadChoices(homeLabel: string, skipResolveStep: boolean): ModeUserConfigChoice[] {
  const choices: ModeUserConfigChoice[] = [];

  for (let magnitude = MIN_MAGNITUDE; magnitude <= MAX_MAGNITUDE + 1e-9; magnitude += STEP) {
    const numeric = Number(magnitude.toFixed(1));

    if (numeric === 0) {
      choices.push(buildChoice(0, homeLabel, skipResolveStep));
      continue;
    }

    const negative = -numeric;
    choices.push(buildChoice(negative, homeLabel, skipResolveStep));
    choices.push(buildChoice(numeric, homeLabel, skipResolveStep));
  }

  return choices;
}

function buildChoice(value: number, homeLabel: string, skipResolveStep: boolean): ModeUserConfigChoice {
  const spread = formatSpread(value);
  const label = `${homeLabel} ${spread}`;
  return {
    id: spread,
    value: spread,
    label,
    patch: {
      spread,
      spread_value: value,
      spread_label: spread,
      ...(skipResolveStep ? { resolve_at: DEFAULT_RESOLVE_AT } : {}),
    },
  };
}

function formatSpread(value: number): string {
  const fixed = Math.abs(value).toFixed(1);
  return value >= 0 ? `+${fixed}` : `-${fixed}`;
}

function buildResolveChoices(): ModeUserConfigChoice[] {
  return ALLOWED_RESOLVE_AT.map((value) => ({
    id: value,
    value,
    label: value,
    patch: { resolve_at: value },
  }));
}

