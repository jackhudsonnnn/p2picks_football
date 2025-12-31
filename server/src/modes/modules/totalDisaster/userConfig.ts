import { getGameDoc, type RefinedGameDoc } from '../../../services/nflData/nflRefinedDataService';
import type { ModeUserConfigChoice, ModeUserConfigStep } from '../../shared/types';
import { shouldSkipResolveStep } from '../../shared/resolveUtils';
import { EITHER_OR_ALLOWED_RESOLVE_AT, EITHER_OR_DEFAULT_RESOLVE_AT } from '../eitherOr/constants';

const LINE_MIN = 0.5;
const LINE_MAX = 199.5;
const LINE_STEP = 1;

interface BuildInput {
  nflGameId?: string | null;
  existingConfig?: Record<string, unknown>;
}

export async function buildTotalDisasterUserConfig(input: BuildInput = {}): Promise<ModeUserConfigStep[]> {
  const debug = process.env.DEBUG_TOTAL_DISASTER === '1' || process.env.DEBUG_TOTAL_DISASTER === 'true';
  const gameId = input.nflGameId ? String(input.nflGameId) : '';
  const title = "Select Over/Under Line";

  const { doc, lineChoices } = await loadChoices(gameId);
  const skipResolveStep = shouldSkipResolveStep(doc);
  const minLineValue = computeMinLineValue(doc);
  const choices: ModeUserConfigChoice[] = buildLineChoices(lineChoices, skipResolveStep, minLineValue);

  if (debug) {
    console.log('[totalDisaster][userConfig] prepared choices', {
      gameId,
      choiceCount: choices.length,
      skipResolveStep,
      status: doc?.status ?? null,
      period: doc?.period ?? null,
      minLineValue,
    });
  }

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

async function loadChoices(gameId: string): Promise<{ doc: RefinedGameDoc | null; lineChoices: ModeUserConfigChoice[] }> {
  if (!gameId) {
    return { doc: null, lineChoices: buildBaseLineChoices() };
  }
  try {
    const doc = await getGameDoc(gameId);
    return { doc, lineChoices: buildBaseLineChoices() };
  } catch (err) {
    return { doc: null, lineChoices: buildBaseLineChoices() };
  }
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
      resolve_at: EITHER_OR_DEFAULT_RESOLVE_AT,
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
  return EITHER_OR_ALLOWED_RESOLVE_AT.map((value) => ({
    id: value,
    value,
    label: value,
    patch: { resolve_at: value },
  }));
}

function computeMinLineValue(doc: RefinedGameDoc | null): number | null {
  if (!doc || !Array.isArray(doc.teams)) return null;
  const total = doc.teams.reduce((sum, team) => {
    const score = Number((team as any)?.score ?? 0);
    return sum + (Number.isFinite(score) ? score : 0);
  }, 0);
  if (!Number.isFinite(total)) return null;
  const baseline = Math.max(0, total);
  const candidate = Math.min(LINE_MAX, baseline + 0.5);
  return Number(candidate.toFixed(1));
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
