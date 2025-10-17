import { loadRefinedGame, type RefinedGameDoc } from '../../../helpers';
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
    const display = numeric.toFixed(1);
    choices.push({
      value: display,
      label: display,
      patch: {
        line: display,
        line_value: numeric,
        line_label: display,
      },
    });
  }
  return choices;
}

function pickHomeTeam(doc: RefinedGameDoc) {
  const teams = Array.isArray(doc.teams) ? doc.teams : [];
  return (
    teams.find((team) => String((team as any)?.homeAway || '').toLowerCase() === 'home') ||
    teams[0] ||
    null
  );
}

function pickAwayTeam(doc: RefinedGameDoc, home: unknown) {
  const teams = Array.isArray(doc.teams) ? doc.teams : [];
  const byFlag = teams.find((team) => String((team as any)?.homeAway || '').toLowerCase() === 'away');
  if (byFlag) return byFlag;
  return teams.find((team) => team !== home) || null;
}

function extractTeamName(team: unknown): string | null {
  if (!team) return null;
  const name = (team as any)?.displayName || (team as any)?.abbreviation || (team as any)?.teamId;
  return name ? String(name) : null;
}
