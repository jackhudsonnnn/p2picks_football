import { getHomeScore, getAwayScore } from '../../../../services/leagueData';
import type { BuildUserConfigInput, ModeUserConfigChoice, ModeUserConfigStep } from '../../../sharedUtils/types';
import { shouldSkipResolveStep, ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT } from '../../../sharedUtils/resolveUtils';
import { LINE_MIN, LINE_MAX, LINE_STEP } from './constants';
import { resolveGameId, type GameContextInput } from '../../../../utils/gameId';
import type { League } from '../../../../types/league';

export async function buildTotalDisasterUserConfig(input: BuildUserConfigInput): Promise<ModeUserConfigStep[]> {
  const gameId = resolveGameId(input as GameContextInput) ?? '';
  const league = input.league ?? 'NFL';
  const title = "Select Over/Under Line";

  const lineChoices = buildBaseLineChoices();
  const skipResolveStep = await shouldSkipResolveStep(league, gameId);
  const minLineValue = await computeMinLineValue(league, gameId);
  const choices: ModeUserConfigChoice[] = buildLineChoices(lineChoices, skipResolveStep, minLineValue);

  const steps: ModeUserConfigStep[] = [
    {
      key: 'line',
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

function buildLineChoices(
  baseChoices: ModeUserConfigChoice[],
  skipResolveStep: boolean,
  minLineValue: number | null,
): ModeUserConfigChoice[] {
  let filtered = baseChoices;
  if (typeof minLineValue === 'number' && Number.isFinite(minLineValue)) {
    filtered = baseChoices.filter((choice) => {
      const numeric = normalizeLineValue(choice);
      return numeric == null || numeric >= minLineValue;
    });
  }
  if (!filtered.length) {
    return [buildUnavailableChoice(minLineValue)];
  }
  if (!skipResolveStep) {
    return filtered;
  }
  return filtered.map((choice) => ({
    ...choice,
    patch: {
      ...(choice.patch || {}),
      resolve_at: DEFAULT_RESOLVE_AT,
    },
  }));
}

function buildBaseLineChoices(): ModeUserConfigChoice[] {
  const choices: ModeUserConfigChoice[] = [];
  for (let value = LINE_MIN; value <= LINE_MAX; value += LINE_STEP) {
    const numeric = Number(value.toFixed(1));
    const name = numeric.toFixed(1);
    choices.push({
      id: name,
      value: name,
      label: name,
      patch: {
        line: name,
        line_value: numeric,
        line_label: name,
      },
    });
  }
  return choices;
}

function buildResolveChoices(): ModeUserConfigChoice[] {
  return ALLOWED_RESOLVE_AT.map((value) => ({
    id: value,
    value,
    label: value,
    patch: { resolve_at: value },
  }));
}

async function computeMinLineValue(league: League, gameId: string): Promise<number | null> {
  if (!gameId) return null;
  try {
    const [home, away] = await Promise.all([getHomeScore(league, gameId), getAwayScore(league, gameId)]);
    const total = (Number.isFinite(Number(home)) ? Number(home) : 0) + (Number.isFinite(Number(away)) ? Number(away) : 0);
    if (!Number.isFinite(total)) return null;
    const baseline = Math.max(0, total);
    const candidate = Math.min(LINE_MAX, baseline + 0.5);
    return Number(candidate.toFixed(1));
  } catch (err) {
    return null;
  }
}

function normalizeLineValue(choice: ModeUserConfigChoice): number | null {
  const fromPatch = choice.patch?.line_value;
  const parsedPatch = typeof fromPatch === 'number' ? fromPatch : Number(fromPatch);
  if (Number.isFinite(parsedPatch)) return parsedPatch;
  const parsedValue = Number(choice.value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function buildUnavailableChoice(minLineValue: number | null): ModeUserConfigChoice {
  const label =
    typeof minLineValue === 'number' && Number.isFinite(minLineValue)
      ? `No lines ≥ ${minLineValue.toFixed(1)} available`
      : 'No lines available';
  return {
    id: 'line_unavailable',
    value: 'line_unavailable',
    label,
    description: 'The current total already exceeds the supported max line. Pick a different mode or wait for the next game.',
    disabled: true,
  };
}
