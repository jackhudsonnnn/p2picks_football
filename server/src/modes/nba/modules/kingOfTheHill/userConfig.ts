import { getAllPlayers } from '../../../../services/leagueData';
import type { BuildUserConfigInput, ModeUserConfigChoice, ModeUserConfigStep } from '../../../types';
import type { LeaguePlayer } from '../../../../services/leagueData/types';
import { resolveGameId, type GameContextInput } from '../../../../utils/gameId';
import {
  NBA_KOTH_ALLOWED_RESOLVE_VALUES,
  NBA_KOTH_DEFAULT_RESOLVE_VALUE,
  NBA_KOTH_STAT_KEY_LABELS,
  getAllowedResolveValuesForStat,
} from './constants';

export async function buildKingOfTheHillUserConfig(input: BuildUserConfigInput): Promise<ModeUserConfigStep[]> {
  const league = input.league ?? 'NBA';
  const gameId = resolveGameId(input as GameContextInput) ?? '';
  const statKey = typeof input.config?.stat === 'string' ? input.config?.stat : null;

  const statChoices: ModeUserConfigChoice[] = Object.entries(NBA_KOTH_STAT_KEY_LABELS).map(([key, label]) => ({
    id: key,
    value: key,
    label,
    patch: { stat: key, stat_label: label },
    clears: ['player1_id', 'player1_name', 'player2_id', 'player2_name', 'resolve_value', 'resolve_value_label'],
  }));

  const players: LeaguePlayer[] = gameId ? await getAllPlayers(league, gameId) : [];
  const playerChoices: ModeUserConfigChoice[] = players.map((p) => ({
    id: p.playerId,
    value: p.playerId,
    label: p.fullName,
    description: p.position,
    patch: { player_id: p.playerId, player_name: p.fullName },
  }));

  const allowedResolveValues = statKey ? getAllowedResolveValuesForStat(statKey) : NBA_KOTH_ALLOWED_RESOLVE_VALUES;
  const resolveChoices: ModeUserConfigChoice[] = allowedResolveValues.map((value) => ({
    id: String(value),
    value: String(value),
    label: String(value),
    patch: { resolve_value: value, resolve_value_label: String(value) },
  }));

  const progressChoices: ModeUserConfigChoice[] = [
    { id: 'starting_now', value: 'starting_now', label: 'Starting Now', patch: { progress_mode: 'starting_now' }, description: 'Capture baselines when betting closes; first to add the threshold wins.' },
    { id: 'cumulative', value: 'cumulative', label: 'Cumulative', patch: { progress_mode: 'cumulative' }, description: 'Use full-game totals; first to reach the threshold wins.' },
  ];

  const steps: ModeUserConfigStep[] = [
    { key: 'stat', title: 'Select Stat', inputType: 'select', choices: statChoices },
    { key: 'player1', title: 'Select Player 1', inputType: 'select', choices: playerChoices },
    { key: 'player2', title: 'Select Player 2', inputType: 'select', choices: playerChoices },
    { key: 'resolve_value', title: 'Resolve Value', inputType: 'select', choices: resolveChoices, description: `Default ${NBA_KOTH_DEFAULT_RESOLVE_VALUE}` },
    { key: 'progress_mode', title: 'Track Progress', inputType: 'select', choices: progressChoices },
  ];

  return steps;
}
