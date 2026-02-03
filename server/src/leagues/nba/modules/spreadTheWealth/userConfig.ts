import { getHomeTeamName } from '../../../../services/leagueData';
import type { BuildUserConfigInput, ModeUserConfigChoice, ModeUserConfigStep } from '../../../types';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT } from '../../utils/statConstants';
import { SPREAD_MIN, SPREAD_MAX, SPREAD_STEP } from './constants';
import { resolveGameId } from '../../../../utils/gameId';

export async function buildNbaSpreadTheWealthUserConfig(input: BuildUserConfigInput): Promise<ModeUserConfigStep[]> {
  const gameId = resolveGameId(input) ?? '';
  const league = input.league ?? 'NBA';
  const title = 'Select Point Spread';
  const homeLabel = await getHomeTeamName(league, gameId);
  const spreadChoices = buildSpreadChoices(homeLabel);
  const resolveChoices: ModeUserConfigChoice[] = ALLOWED_RESOLVE_AT.map((v) => ({
    id: v,
    value: v,
    label: v,
    patch: { resolve_at: v },
  }));

  return [
    {
      key: 'spread',
      title,
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

function buildSpreadChoices(homeLabel: string): ModeUserConfigChoice[] {
  const choices: ModeUserConfigChoice[] = [];
  // Start at home +0.0 and grow outward like NFL (0, -0.5, +0.5, -1.0, +1.0, ...)
  const magnitudes: number[] = [];
  for (let value = 0; value <= SPREAD_MAX + 1e-9; value += SPREAD_STEP) {
    const numeric = Math.round(value * 2) / 2;
    if (!magnitudes.includes(numeric)) magnitudes.push(numeric);
  }

  // build choices in the order: +0.0, -0.5, +0.5, -1.0, +1.0, ...
  const orderedValues: number[] = [];
  for (let i = 0; i < magnitudes.length; i++) {
    const mag = magnitudes[i];
    if (mag === 0) {
      orderedValues.push(0);
    } else {
      if (-mag >= SPREAD_MIN) orderedValues.push(-mag);
      if (mag <= SPREAD_MAX) orderedValues.push(mag);
    }
  }

  orderedValues.forEach((numeric) => {
    const spread = formatSpread(numeric);
    const label = `${homeLabel} ${spread}`;
    choices.push({
      id: spread,
      value: spread,
      label,
      patch: { spread, spread_value: numeric, spread_label: spread },
    });
  });

  return choices;
}

function formatSpread(value: number): string {
  const fixed = Math.abs(value).toFixed(1);
  return value >= 0 ? `+${fixed}` : `-${fixed}`;
}
