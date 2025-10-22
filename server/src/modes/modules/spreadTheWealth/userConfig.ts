import type { ModeUserConfigChoice, ModeUserConfigStep } from '../../shared/types';

const LINE_MIN = 0.5;
const LINE_MAX = 199.5;
const LINE_STEP = 1;

interface BuildInput {
  nflGameId?: string | null;
  existingConfig?: Record<string, unknown>;
}

export async function buildSpreadTheWealthUserConfig(input: BuildInput = {}): Promise<ModeUserConfigStep[]> {
  const debug = process.env.DEBUG_SPREAD_THE_WEALTH === '1' || process.env.DEBUG_SPREAD_THE_WEALTH === 'true';
  const gameId = input.nflGameId ? String(input.nflGameId) : '';
  const title = "Select Over/Under Line";

  const choices: ModeUserConfigChoice[] = buildLineChoices();

  if (debug) {
    console.log('[spreadTheWealth][userConfig] prepared choices', {
      gameId,
      choiceCount: choices.length,
    });
  }

  return [[title, choices]];
}

function buildLineChoices(): ModeUserConfigChoice[] {
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
