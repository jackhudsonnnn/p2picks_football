import { getAllPlayers } from '../../../../services/leagueData';
import type { BuildUserConfigInput, ModeUserConfigChoice, ModeUserConfigStep } from '../../../types';
import type { LeaguePlayer } from '../../../../services/leagueData/types';
import { resolveGameId, type GameContextInput } from '../../../../utils/gameId';
import { ALLOWED_RESOLVE_AT, DEFAULT_RESOLVE_AT, NBA_STAT_KEY_LABELS } from '../../utils/statConstants';

export async function buildEitherOrUserConfig(input: BuildUserConfigInput): Promise<ModeUserConfigStep[]> {
  const league = input.league ?? 'NBA';
  const gameId = resolveGameId(input as GameContextInput) ?? '';

  const statChoices: ModeUserConfigChoice[] = Object.entries(NBA_STAT_KEY_LABELS).map(([key, label]) => ({
    id: key,
    value: key,
    label,
    patch: { stat: key, stat_label: label },
    clears: ['player1_id', 'player1_name', 'player2_id', 'player2_name'],
  }));

  const players: LeaguePlayer[] = gameId ? await getAllPlayers(league, gameId) : [];
  const playerChoices: ModeUserConfigChoice[] = players.map((p) => ({
    id: p.playerId,
    value: p.playerId,
    label: p.fullName,
    description: p.position,
    patch: { player_id: p.playerId, player_name: p.fullName },
  }));

  const resolveChoices: ModeUserConfigChoice[] = ALLOWED_RESOLVE_AT.map((v) => ({
    id: v,
    value: v,
    label: v,
    patch: { resolve_at: v },
  }));

  const progressChoices: ModeUserConfigChoice[] = [
    { id: 'starting_now', value: 'starting_now', label: 'Starting Now', patch: { progress_mode: 'starting_now' }, description: 'Capture baselines when betting closes.' },
    { id: 'cumulative', value: 'cumulative', label: 'Cumulative', patch: { progress_mode: 'cumulative' }, description: 'Compare total stats at resolve time.' },
  ];

  const steps: ModeUserConfigStep[] = [
    { key: 'stat', title: 'Select Stat', inputType: 'select', choices: statChoices },
    { key: 'player1', title: 'Select Player 1', inputType: 'select', choices: playerChoices },
    { key: 'player2', title: 'Select Player 2', inputType: 'select', choices: playerChoices },
    { key: 'resolve_at', title: 'Resolve At', inputType: 'select', choices: resolveChoices },
    { key: 'progress_mode', title: 'Track Progress', inputType: 'select', choices: progressChoices },
  ];

  return steps;
}
