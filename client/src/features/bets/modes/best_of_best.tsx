import React from 'react';
import { supabase } from '@shared/api/supabaseClient';
import { ModeDefinition } from './base';

export interface BestOfBestConfig {
  player1_name?: string;
  player2_name?: string;
  stat?: 'Receptions' | 'Receiving Yards' | 'Touchdowns';
  resolve_after?: 'Q1 ends' | 'Q2 ends' | 'Q3 ends' | 'Q4 ends';
}

export const BestOfBestFormFields: React.FC<{ value: BestOfBestConfig; onChange: (p: Partial<BestOfBestConfig>) => void; players?: any[]; game?: any; allowedResolveAfter?: string[]; }> = ({ value, onChange, players = [], allowedResolveAfter }) => {
  const selectablePlayers = players.filter((p) => ['WR', 'TE', 'RB'].includes(p.position));
  const quarters = allowedResolveAfter && allowedResolveAfter.length
    ? allowedResolveAfter
    : ['Q1 ends', 'Q2 ends', 'Q3 ends', 'Q4 ends'];
  return (
    <div className="mode-fields best-of-best-fields">
      <label>Player 1
        <select value={value.player1_name || ''} onChange={(e) => onChange({ player1_name: e.target.value })}>
          <option value="">Select Player</option>
          {selectablePlayers.map((p: any) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
      </label>
      <label>Player 2
        <select value={value.player2_name || ''} onChange={(e) => onChange({ player2_name: e.target.value })}>
          <option value="">Select Player</option>
          {selectablePlayers.filter((p: any) => p.name !== value.player1_name).map((p: any) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
      </label>
      <label>Stat
        <select value={value.stat || ''} onChange={(e) => onChange({ stat: e.target.value as any })}>
          <option value="">Select Stat</option>
          <option value="Receptions">Receptions</option>
          <option value="Receiving Yards">Receiving Yards</option>
          <option value="Touchdowns">Touchdowns</option>
        </select>
      </label>
      <label>Resolve After
        <select value={value.resolve_after || ''} onChange={(e) => onChange({ resolve_after: e.target.value as any })}>
          <option value="">Select Quarter</option>
          {quarters.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
      </label>
    </div>
  );
};

export const bestOfBestMode: ModeDefinition = {
  key: 'best_of_best',
  label: 'Best of the Best',
  summary: ({ config }) => {
    if (!config) return 'Best of the Best';
    const { stat, resolve_after } = config as BestOfBestConfig;
    return `Best of the Best • ${stat || ''} • ${resolve_after || ''}`.trim();
  },
  options: ({ config }) => {
    const c = config as BestOfBestConfig;
    const p1 = c?.player1_name; const p2 = c?.player2_name;
    return ['pass', ...(p1 ? [p1] : []), ...(p2 ? [p2] : [])];
  },
  buildDescription: (c: BestOfBestConfig) => `Largest increase in ${c.stat || 'stat'} until ${c.resolve_after || 'selected time'}`,
  validateConfig: (c: BestOfBestConfig) => {
    const errs: string[] = [];
    if (!c.player1_name) errs.push('Player 1 required');
    if (!c.player2_name) errs.push('Player 2 required');
    if (c.player1_name && c.player2_name && c.player1_name === c.player2_name) errs.push('Players must differ');
    if (!c.stat) errs.push('Stat required');
    if (!c.resolve_after) errs.push('Resolve after required');
    if (errs.length) throw new Error(errs.join('; '));
  },
  persistConfig: async ({ bet, config }) => {
    const c = config as BestOfBestConfig;
    const payload = { bet_id: bet.bet_id, player1_name: c.player1_name, player2_name: c.player2_name, stat: c.stat, resolve_after: c.resolve_after };
    const { error } = await supabase.from('bet_mode_best_of_best').insert([payload]);
    if (error) throw error;
  },
  FormFields: BestOfBestFormFields,
  winningConditionText: (c: BestOfBestConfig) => `Largest net increase in ${c.stat} until ${c.resolve_after}`,
};
