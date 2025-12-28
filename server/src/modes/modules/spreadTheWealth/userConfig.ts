import { getGameDoc, type RefinedGameDoc } from '../../../utils/refinedDocAccessors';
import type { ModeUserConfigChoice, ModeUserConfigStep } from '../../shared/types';
import { shouldSkipResolveStep } from '../../shared/resolveUtils';
import { extractTeamName, pickHomeTeam } from '../../shared/utils';
import { EITHER_OR_ALLOWED_RESOLVE_AT, EITHER_OR_DEFAULT_RESOLVE_AT } from '../eitherOr/constants';

const MIN_MAGNITUDE = 0;
const MAX_MAGNITUDE = 99.5;
const STEP = 0.5;

interface BuildInput {
  nflGameId?: string | null;
  existingConfig?: Record<string, unknown>;
}

export async function buildSpreadTheWealthUserConfig(input: BuildInput = {}): Promise<ModeUserConfigStep[]> {
  const debug = process.env.DEBUG_SPREAD_THE_WEALTH === '1' || process.env.DEBUG_SPREAD_THE_WEALTH === 'true';
  const gameId = input.nflGameId ? String(input.nflGameId) : '';
  const title = 'Select Point Spread';

  let homeLabel = 'Home Team';
  let doc: RefinedGameDoc | null = null;

  if (gameId) {
    try {
      doc = await getGameDoc(gameId);
      if (doc) {
        const home = pickHomeTeam(doc);
        const homeName = extractTeamName(home);
        if (homeName) {
          homeLabel = homeName;
        }
      }
    } catch (err) {
      if (debug) {
  console.warn('[spreadTheWealth][userConfig] failed to load game context', {
          gameId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const skipResolveStep = shouldSkipResolveStep(doc);
  const choices: ModeUserConfigChoice[] = buildSpreadChoices(homeLabel, skipResolveStep);

  if (debug) {
  console.log('[spreadTheWealth][userConfig] prepared choices', {
      gameId,
      choiceCount: choices.length,
      skipResolveStep,
      status: doc?.status ?? null,
      period: doc?.period ?? null,
    });
  }

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
      ...(skipResolveStep ? { resolve_at: EITHER_OR_DEFAULT_RESOLVE_AT } : {}),
    },
  };
}

function formatSpread(value: number): string {
  const fixed = Math.abs(value).toFixed(1);
  return value >= 0 ? `+${fixed}` : `-${fixed}`;
}

function buildResolveChoices(): ModeUserConfigChoice[] {
  return EITHER_OR_ALLOWED_RESOLVE_AT.map((value) => ({
    id: value,
    value,
    label: value,
    patch: { resolve_at: value },
  }));
}

