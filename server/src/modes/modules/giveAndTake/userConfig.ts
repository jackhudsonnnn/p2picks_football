import { loadRefinedGame } from '../../../helpers';
import type { ModeUserConfigChoice, ModeUserConfigStep } from '../../shared/types';
import { extractTeamName, pickHomeTeam } from '../../shared/utils';

const MIN_MAGNITUDE = 0.5;
const MAX_MAGNITUDE = 99.5;
const STEP = 1;

interface BuildInput {
  nflGameId?: string | null;
  existingConfig?: Record<string, unknown>;
}

export async function buildGiveAndTakeUserConfig(input: BuildInput = {}): Promise<ModeUserConfigStep[]> {
  const debug = process.env.DEBUG_GIVE_AND_TAKE === '1' || process.env.DEBUG_GIVE_AND_TAKE === 'true';
  const gameId = input.nflGameId ? String(input.nflGameId) : '';
  const title = 'Select Point Spread';

  let homeLabel = 'Home Team';

  if (gameId) {
    try {
      const doc = await loadRefinedGame(gameId);
      if (doc) {
        const home = pickHomeTeam(doc);
        const homeName = extractTeamName(home);
        if (homeName) {
          homeLabel = homeName;
        }
      }
    } catch (err) {
      if (debug) {
        console.warn('[giveAndTake][userConfig] failed to load game context', {
          gameId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const choices: ModeUserConfigChoice[] = buildSpreadChoices(homeLabel);

  if (debug) {
    console.log('[giveAndTake][userConfig] prepared choices', {
      gameId,
      choiceCount: choices.length,
    });
  }

  return [[title, choices]];
}

function buildSpreadChoices(homeLabel: string): ModeUserConfigChoice[] {
  const choices: ModeUserConfigChoice[] = [];
  for (let magnitude = MIN_MAGNITUDE; magnitude <= MAX_MAGNITUDE; magnitude += STEP) {
    const numeric = Number(magnitude.toFixed(1));
    const negative = -numeric;
    choices.push(buildChoice(negative, homeLabel));
    choices.push(buildChoice(numeric, homeLabel));
  }
  return choices;
}

function buildChoice(value: number, homeLabel: string): ModeUserConfigChoice {
  const spread = formatSpread(value);
  const label = `${homeLabel} ${spread}`;
  return {
    value: spread,
    label,
    patch: {
      spread,
      spread_value: value,
      spread_label: spread,
    },
  };
}

function formatSpread(value: number): string {
  const fixed = Math.abs(value).toFixed(1);
  return value >= 0 ? `+${fixed}` : `-${fixed}`;
}

