import { loadRefinedGame, type RefinedGameDoc } from '../../../helpers';
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
  const choices: ModeUserConfigChoice[] = buildLineChoices(lineChoices, skipResolveStep);

  if (debug) {
    console.log('[totalDisaster][userConfig] prepared choices', {
      gameId,
      choiceCount: choices.length,
      skipResolveStep,
      status: doc?.status ?? null,
      period: doc?.period ?? null,
    });
  }

  const steps: ModeUserConfigStep[] = [[title, choices]];

  if (!skipResolveStep) {
    steps.push(['Resolve At', buildResolveChoices()]);
  }

  return steps;
}

async function loadChoices(gameId: string): Promise<{ doc: RefinedGameDoc | null; lineChoices: ModeUserConfigChoice[] }> {
  if (!gameId) {
    return { doc: null, lineChoices: buildBaseLineChoices() };
  }
  try {
    const doc = await loadRefinedGame(gameId);
    return { doc, lineChoices: buildBaseLineChoices() };
  } catch (err) {
    return { doc: null, lineChoices: buildBaseLineChoices() };
  }
}

function buildLineChoices(baseChoices: ModeUserConfigChoice[], skipResolveStep: boolean): ModeUserConfigChoice[] {
  if (!skipResolveStep) {
    return baseChoices;
  }
  return baseChoices.map((choice) => ({
    ...choice,
    patch: {
      ...choice.patch,
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
    value,
    label: value,
    patch: { resolve_at: value },
  }));
}
