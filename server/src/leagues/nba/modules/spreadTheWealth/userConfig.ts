import type { BuildUserConfigInput, ModeUserConfigChoice, ModeUserConfigStep } from '../../../types';
import { SPREAD_MIN, SPREAD_MAX, SPREAD_STEP } from './constants';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT } from '../../utils/statConstants';

export async function buildNbaSpreadTheWealthUserConfig(_input: BuildUserConfigInput): Promise<ModeUserConfigStep[]> {
  const spreadChoices = buildSpreadChoices();
  const resolveChoices: ModeUserConfigChoice[] = ALLOWED_RESOLVE_AT.map((v) => ({
    id: v,
    value: v,
    label: v,
    patch: { resolve_at: v },
  }));

  return [
    {
      key: 'spread',
      title: 'Select Point Spread',
      inputType: 'select',
      choices: spreadChoices,
    },
    {
      key: 'resolve_at',
      title: 'Resolve At',
      inputType: 'select',
      choices: resolveChoices,
      selectedChoiceId: DEFAULT_RESOLVE_AT,
    },
  ];
}

function buildSpreadChoices(): ModeUserConfigChoice[] {
  const choices: ModeUserConfigChoice[] = [];
  for (let value = SPREAD_MIN; value <= SPREAD_MAX + 1e-9; value += SPREAD_STEP) {
    const numeric = Math.round(value * 2) / 2;
    const label = numeric.toFixed(1);
    choices.push({
      id: label,
      value: label,
      label,
      patch: { spread: label, spread_value: numeric, spread_label: label },
    });
  }
  return choices;
}
