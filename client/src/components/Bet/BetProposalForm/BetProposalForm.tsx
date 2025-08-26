import React, { useState, useMemo } from 'react';
import nflGames from '@assets/mock/nfl_games.json';
import './BetProposalForm.css';
import { IoIosArrowBack, IoIosArrowForward } from 'react-icons/io';
import { modeRegistry } from '@features/bets/modes';
import { mergeConfig } from '@features/bets/modes/base';

type ModeKey = string;

export interface BetProposalFormValues {
  nfl_game_id: string;
  wager_amount: number;
  time_limit_seconds: number;
  mode: ModeKey;
  description: string;
  [key: string]: any;
}

interface BetProposalFormProps { onSubmit: (values: BetProposalFormValues) => void; loading?: boolean; }

type NflGame = { nfl_game_id: string; shortName: string; start_time: string; status: { name: string; period?: number }; home: { id: string; name: string; abbreviation: string }; away: { id: string; name: string; abbreviation: string }; players: { id: string; name: string; team: 'home' | 'away'; position: string }[]; };

const MODE_OPTIONS: { value: ModeKey; label: string }[] = Object.values(modeRegistry).map(m => ({ value: m.key, label: m.label }));

const BetProposalForm: React.FC<BetProposalFormProps> = ({ onSubmit, loading }) => {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<ModeKey>('');
  const [selectedGameId, setSelectedGameId] = useState('');
  const [wagerAmount, setWagerAmount] = useState<number>(1);
  const [timeLimit, setTimeLimit] = useState<number>(30);
  const [modeConfig, setModeConfig] = useState<any>({});

  const games = nflGames as unknown as NflGame[];
  const availableGames = useMemo(() => {
    const now = new Date();
    return games.filter(g => {
      if (g.status?.name === 'STATUS_IN_PROGRESS') return true;
      const start = new Date(g.start_time);
      const diffHrs = (start.getTime() - now.getTime()) / 3600000;
      return diffHrs >= 0 && diffHrs <= 6;
    });
  }, [games]);
  const selectedGame = useMemo(() => availableGames.find(g => g.nfl_game_id === selectedGameId), [availableGames, selectedGameId]);
  const allowedResolveAfter = useMemo(() => {
    if (!selectedGame) return ['Q1 ends', 'Q2 ends', 'Q3 ends', 'Q4 ends'];
    const state = selectedGame.status?.name;
    const period = selectedGame.status?.period ?? 1;
    const base: string[] = [];
    if (state !== 'STATUS_FINAL') {
      if (period <= 1) base.push('Q1 ends');
      if (period <= 2) base.push('Q2 ends');
      if (period <= 3) base.push('Q3 ends');
    }
    base.push('Q4 ends');
    return base;
  }, [selectedGame]);

  const def = mode ? modeRegistry[mode] : undefined;
  const totalSteps = useMemo(() => {
    if (!mode) return 2; // select, review (disabled until valid)
    return def?.FormFields ? 4 : 3; // select, (config), wager/time, review
  }, [mode, def]);

  const canNext = useMemo(() => {
    if (step === 0) return !!selectedGameId && !!mode;
    if (def?.FormFields && step === 1 && def.validateConfig) {
      try { def.validateConfig(modeConfig); } catch { return false; }
    }
    if (step === totalSteps - 2) return wagerAmount >= 1 && timeLimit >= 10 && timeLimit <= 60;
    return true;
  }, [step, mode, selectedGameId, def, modeConfig, wagerAmount, timeLimit, totalSteps]);

  const canSubmit = step === totalSteps - 1;

  const stepContent = () => {
    if (step === 0) {
      return (
        <div className="form-step">
          <div className="form-group">
            <label className="form-label" htmlFor="nfl_game">NFL Game</label>
            <select id="nfl_game" className="form-select" value={selectedGameId} onChange={e => setSelectedGameId(e.target.value)} required>
              <option value="" disabled>Select NFL Game</option>
              {availableGames.map(g => <option key={g.nfl_game_id} value={g.nfl_game_id}>{g.shortName} ({new Date(g.start_time).toLocaleString()})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="mode">Game Mode</label>
            <select id="mode" className="form-select" value={mode} onChange={e => { setMode(e.target.value); setModeConfig({}); setStep(0); }} required>
              <option value="" disabled>Select Mode</option>
              {MODE_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>
      );
    }
    if (def?.FormFields && step === 1) {
      const Fields = def.FormFields;
      return <Fields value={modeConfig} onChange={(p: any) => setModeConfig((prev: any) => mergeConfig(prev, p))} players={selectedGame?.players || []} game={selectedGame} allowedResolveAfter={allowedResolveAfter} />;
    }
    if (step === totalSteps - 2) {
      return (
        <div className="form-step">
          <div className="form-group">
            <label className="form-label" htmlFor="wager_amount">Wager (pts)</label>
            <input id="wager_amount" className="form-input" type="number" min={1} step={1} value={wagerAmount} onChange={e => setWagerAmount(Number(e.target.value))} required />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="time_limit_seconds">Time Limit (seconds)</label>
            <input id="time_limit_seconds" className="form-input" type="number" min={10} max={60} value={timeLimit} onChange={e => setTimeLimit(Number(e.target.value))} required />
          </div>
        </div>
      );
    }
    if (step === totalSteps - 1) {
      return (
        <div className="form-step centered-step">
          <div><strong>{wagerAmount} pt(s)</strong> • {timeLimit}s window</div>
          <div>{def?.summary({ config: modeConfig })}</div>
        </div>
      );
    }
    return null;
  };

  const handleNext = () => { if (canNext) setStep(s => s + 1); };
  const handleBack = () => { setStep(s => Math.max(0, s - 1)); };
  const handleSubmit = () => {
    const description = def?.buildDescription ? def.buildDescription(modeConfig) : 'Bet';
    onSubmit({ nfl_game_id: selectedGameId, wager_amount: wagerAmount, time_limit_seconds: timeLimit, mode, description, ...modeConfig });
  };

  return (
    <div className="bet-proposal-form">
      <div className="form-content">{stepContent()}</div>
      <div className="form-navigation">
        <button className="nav-button" type="button" onClick={handleBack} disabled={step === 0} aria-label="Previous step" title="Previous step"><IoIosArrowBack /></button>
        {canSubmit ? (
          <button className="submit-button" type="button" onClick={handleSubmit} disabled={loading} aria-label="Submit bet" title="Submit bet">Submit</button>
        ) : (
          <button className="nav-button" type="button" onClick={handleNext} disabled={!canNext} aria-label="Next step" title="Next step"><IoIosArrowForward /></button>
        )}
      </div>
    </div>
  );
};

export default BetProposalForm;