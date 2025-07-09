import React, { useState, useEffect } from "react";
import nbaGamesData from "./nba_data.json";
import './BetProposalForm.css';
import { IoIosArrowBack, IoIosArrowForward } from 'react-icons/io';

export interface BetProposalFormValues {
  nba_game_id: string;
  entity1_name: string;
  entity1_proposition: string;
  entity2_name: string;
  entity2_proposition: string;
  wager_amount: number;
  time_limit_seconds: number;
}

interface BetProposalFormProps {
  onSubmit: (values: BetProposalFormValues) => void;
  onCancel: () => void;
  loading?: boolean;
}

const propOptions = [
  { value: "Next 3", label: "Next 3" },
  { value: "Next 2", label: "Next 2" },
  { value: "Next Point", label: "Next Point" },
];

const BetProposalForm: React.FC<BetProposalFormProps> = ({ onSubmit, onCancel, loading }) => {
  const [form, setForm] = useState<BetProposalFormValues>({
    nba_game_id: "",
    entity1_name: "",
    entity1_proposition: "",
    entity2_name: "",
    entity2_proposition: "",
    wager_amount: 1,
    time_limit_seconds: 30,
  });
  const [nbaGames, setNbaGames] = useState<any[]>([]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setNbaGames(nbaGamesData);
  }, []);

  // Auto-fill entity names when nba_game_id changes
  useEffect(() => {
    const selected = nbaGames.find(g => g.nba_game_id === form.nba_game_id);
    if (selected) {
      setForm(prev => ({
        ...prev,
        entity1_name: selected.home_team,
        entity2_name: selected.away_team
      }));
    }
  }, [form.nba_game_id, nbaGames]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "wager_amount" || name === "time_limit_seconds" ? Number(value) : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const steps = [
    // Step 0: Select NBA Game
    <div className="form-step" key="step-nba-game">
      <label className="form-label" htmlFor="nba_game_id">NBA Game</label>
      <select id="nba_game_id" name="nba_game_id" value={form.nba_game_id} onChange={handleChange} required className="form-select">
        <option value="" disabled>Select NBA Game</option>
        {nbaGames.map(game => (
          <option key={game.nba_game_id} value={game.nba_game_id}>
            {game.home_team} vs {game.away_team} ({new Date(game.start_time).toLocaleString()})
          </option>
        ))}
      </select>
    </div>,
    // Step 1: Team 1 prop
    <div className="form-step" key="step-entity1-prop">
      <label className="form-label">{form.entity1_name || 'Team 1'} Proposition</label>
      <select name="entity1_proposition" value={form.entity1_proposition} onChange={handleChange} required className="form-select">
        <option value="" disabled>Select Proposition</option>
        {propOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>,
    // Step 2: Team 2 prop
    <div className="form-step" key="step-entity2-prop">
      <label className="form-label">{form.entity2_name || 'Team 2'} Proposition</label>
      <select name="entity2_proposition" value={form.entity2_proposition} onChange={handleChange} required className="form-select">
        <option value="" disabled>Select Proposition</option>
        {propOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>,
    // Step 3: Wager and Time Limit
    <div className="form-step" key="step-wager-time">
      <div className="form-group">
        <label className="form-label" htmlFor="wager_amount">Wager ($)</label>
        <input id="wager_amount" name="wager_amount" type="number" min={1} step={0.01} value={form.wager_amount} onChange={handleChange} placeholder="Wager Amount" required className="form-input" />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="time_limit_seconds">Time Limit (seconds)</label>
        <input id="time_limit_seconds" name="time_limit_seconds" type="number" min={10} max={60} value={form.time_limit_seconds} onChange={handleChange} placeholder="Time Limit (seconds)" required className="form-input" />
      </div>
    </div>
  ];

  const canNext = () => {
    if (step === 0) return !!form.nba_game_id;
    if (step === 1) return !!form.entity1_proposition;
    if (step === 2) return !!form.entity2_proposition;
    if (step === 3) return form.wager_amount >= 1 && form.time_limit_seconds >= 10 && form.time_limit_seconds <= 60;
    return false;
  };

  return (
    <form onSubmit={handleSubmit} className="bet-proposal-form horizontal-stepper">
      <button type="button" className="form-x-cancel" onClick={onCancel} aria-label="Cancel">
        ×
      </button>
      <div className="stepper-content">
        <button type="button" className="stepper-arrow left" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} aria-label="Previous">
          <IoIosArrowBack size={28} />
        </button>
        <div className="stepper-slide">{steps[step]}</div>
        <button type="button" className="stepper-arrow right" onClick={() => canNext() && setStep(s => Math.min(steps.length - 1, s + 1))} disabled={step === steps.length - 1 || !canNext()} aria-label="Next">
          <IoIosArrowForward size={28} />
        </button>
      </div>
      <div className="form-actions-horizontal">
        {step === steps.length - 1 ? (
          <button type="submit" className="form-submit" disabled={loading || !canNext()}>Propose Bet</button>
        ) : null}
      </div>
    </form>
  );
};

export default BetProposalForm;
