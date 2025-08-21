import React, { useState, useMemo } from "react";
import nflGames from "../../../assets/mock/nfl_games.json";
import "./BetProposalForm.css";
import { IoIosArrowBack, IoIosArrowForward } from "react-icons/io";

type ModeKey = "best_of_best" | "one_leg_spread";

export interface BetProposalFormValues {
  nfl_game_id: string;
  wager_amount: number;
  time_limit_seconds: number;
  mode: ModeKey;
  player1_name?: string;
  player2_name?: string;
  stat?: "Receptions" | "Receiving Yards" | "Touchdowns";
  resolve_after?: "Q1 ends" | "Q2 ends" | "Q3 ends" | "Q4 ends";
  description: string;
}

interface BetProposalFormProps {
  onSubmit: (values: BetProposalFormValues) => void;
  loading?: boolean;
}

type NflGame = {
  nfl_game_id: string;
  shortName: string;
  start_time: string;
  status: { name: string; period?: number };
  home: { id: string; name: string; abbreviation: string };
  away: { id: string; name: string; abbreviation: string };
  players: { id: string; name: string; team: "home" | "away"; position: string }[];
};

const MODE_OPTIONS: { value: ModeKey; label: string }[] = [
  { value: "best_of_best", label: "Best of the Best" },
  { value: "one_leg_spread", label: "1 Leg Spread" },
];

const STATS_OPTIONS = [
  { value: "Receptions", label: "Receptions" },
  { value: "Receiving Yards", label: "Receiving Yards" },
  { value: "Touchdowns", label: "Touchdowns" },
] as const;

export const BetProposalForm: React.FC<BetProposalFormProps> = ({ onSubmit, loading }) => {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<ModeKey | "">("");
  const [selectedGameId, setSelectedGameId] = useState("");
  const [player1Id, setPlayer1Id] = useState("");
  const [player2Id, setPlayer2Id] = useState("");
  const [stat, setStat] = useState<BetProposalFormValues["stat"]>();
  const [resolveAfter, setResolveAfter] = useState<BetProposalFormValues["resolve_after"]>();
  const [wagerAmount, setWagerAmount] = useState<number>(1);
  const [timeLimit, setTimeLimit] = useState<number>(30);

  const games = nflGames as unknown as NflGame[];

  const availableGames = useMemo(() => {
    const now = new Date();
    return games.filter((g) => {
      if (g.status?.name === "STATUS_IN_PROGRESS") return true;
      const start = new Date(g.start_time);
      const diffHrs = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
      return diffHrs >= 0 && diffHrs <= 6;
    });
  }, [games]);

  const selectedGame = useMemo(() => availableGames.find((g) => g.nfl_game_id === selectedGameId), [availableGames, selectedGameId]);

  const players = selectedGame?.players ?? [];
  const team1 = selectedGame?.home;
  const team2 = selectedGame?.away;

  const allowedResolveAfter = useMemo((): BetProposalFormValues["resolve_after"][] => {
    if (!selectedGame) return ["Q1 ends", "Q2 ends", "Q3 ends", "Q4 ends"];
    const state = selectedGame.status?.name;
    const period = selectedGame.status?.period ?? 1;
    const base: BetProposalFormValues["resolve_after"][] = [];
    if (state !== "STATUS_FINAL") {
      if (period <= 1) base.push("Q1 ends");
      if (period <= 2) base.push("Q2 ends");
      if (period <= 3) base.push("Q3 ends");
    }
    base.push("Q4 ends");
    return base;
  }, [selectedGame]);

  const canNext = useMemo(() => {
    if (step === 0) {
      return !!selectedGameId && !!mode;
    }
    if (mode === "best_of_best") {
      if (step === 1) {
        return !!player1Id && !!player2Id && player1Id !== player2Id;
      }
      if (step === 2) {
        return !!stat && !!resolveAfter;
      }
      if (step === 3) {
        return wagerAmount >= 1 && timeLimit >= 10 && timeLimit <= 60;
      }
    } else if (mode === "one_leg_spread") {
      if (step === 1) {
        return wagerAmount >= 1 && timeLimit >= 10 && timeLimit <= 60;
      }
    }
    return false;
  }, [step, selectedGameId, mode, player1Id, player2Id, stat, resolveAfter, wagerAmount, timeLimit]);

  const totalSteps = useMemo(() => (mode === "best_of_best" ? 5 : mode === "one_leg_spread" ? 3 : 2), [mode]);

  const stepContent = () => {
    if (step === 0) {
      return (
        <div>
          <div className="form-step">
            <div className="form-group">
              <label className="form-label" htmlFor="nfl_game">NFL Game</label>
              <select id="nfl_game" className="form-select" value={selectedGameId} onChange={(e) => setSelectedGameId(e.target.value)} required>
                <option value="" disabled>Select NFL Game</option>
                {availableGames.map((g) => (
                  <option key={g.nfl_game_id} value={g.nfl_game_id}>
                    {g.shortName} ({new Date(g.start_time).toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="mode">Game Mode</label>
              <select id="mode" className="form-select" value={mode} onChange={(e) => setMode(e.target.value as ModeKey)} required>
                <option value="" disabled>Select Mode</option>
                {MODE_OPTIONS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
              </select>
            </div>
          </div>
        </div>
      );
    }
    if (mode === "best_of_best") {
      if (step === 1) {
        return (
          <div className="form-step">
            <label className="form-label">Choose Two Players</label>
            <div className="form-group">
              <select className="form-select" value={player1Id} onChange={(e) => setPlayer1Id(e.target.value)} required>
                <option value="" disabled>Player 1</option>
                {players.map((p) => (<option key={p.id} value={p.id}>{p.name} ({p.team === "home" ? team1?.abbreviation : team2?.abbreviation})</option>))}
              </select>
            </div>
            <div className="form-group">
              <select className="form-select" value={player2Id} onChange={(e) => setPlayer2Id(e.target.value)} required>
                <option value="" disabled>Player 2</option>
                {players.map((p) => (<option key={p.id} value={p.id}>{p.name} ({p.team === "home" ? team1?.abbreviation : team2?.abbreviation})</option>))}
              </select>
            </div>
          </div>
        );
      }
      if (step === 2) {
        return (
          <div className="form-step">
            <div className="form-group">
              <label className="form-label" htmlFor="stat">Stat / Prop</label>
              <select id="stat" className="form-select" value={stat ?? ""} onChange={(e) => setStat(e.target.value as any)} required>
                <option value="" disabled>Select Stat</option>
                {STATS_OPTIONS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="resolve_after">Resolve After</label>
              <select id="resolve_after" className="form-select" value={resolveAfter ?? ""} onChange={(e) => setResolveAfter(e.target.value as any)} required>
                <option value="" disabled>Select</option>
                {allowedResolveAfter.map((q) => (<option key={q} value={q}>{q}</option>))}
              </select>
            </div>
          </div>
        );
      }
      if (step === 3) {
        return (
          <div className="form-step">
            <div className="form-group">
              <label className="form-label" htmlFor="wager_amount">Wager (pts)</label>
              <input id="wager_amount" className="form-input" type="number" min={1} step={1} value={wagerAmount} onChange={(e) => setWagerAmount(Number(e.target.value))} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="time_limit_seconds">Time Limit (seconds)</label>
              <input id="time_limit_seconds" className="form-input" type="number" min={10} max={60} value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} required />
            </div>
          </div>
        );
      }
    if (step === 4) {
        const p1 = players.find((p) => p.id === player1Id);
        const p2 = players.find((p) => p.id === player2Id);
        return (
      <div className="form-step centered-step">
            <div>{selectedGame ? <strong>{selectedGame.shortName} — Best of the Best</strong> : ''}</div>
            <div><strong>{timeLimit}s</strong> to choose — <strong>{wagerAmount} pt(s)</strong> to lose</div>
            <div>{(p1 && p2) ? (<><strong>{p1.name}</strong> vs <strong>{p2.name}</strong></>) : ''}</div>
            <div>Largest ↑ in <strong>{stat}</strong></div>
            <div>Resolved After <strong>{resolveAfter}</strong></div>
          </div>
        );
      }
    }
    if (mode === "one_leg_spread") {
      if (step === 1) {
        return (
          <div className="form-step">
            <div className="form-group">
              <label className="form-label" htmlFor="wager_amount">Wager (pts)</label>
              <input id="wager_amount" className="form-input" type="number" min={1} step={1} value={wagerAmount} onChange={(e) => setWagerAmount(Number(e.target.value))} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="time_limit_seconds">Time Limit (seconds)</label>
              <input id="time_limit_seconds" className="form-input" type="number" min={10} max={60} value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} required />
            </div>
          </div>
        );
      }
      if (step === 2) {
        return (
          <div className="form-step centered-step">
            <div><strong>{timeLimit}s</strong> to choose — <strong>{wagerAmount} pt(s)</strong> to lose</div>
            <div>1 Leg Spread — Details TBD</div>
          </div>
        );
      }
    }
    return null;
  };

  const canSubmit = step === totalSteps - 1;

  const handleNext = () => { if (canNext) setStep((s) => s + 1); };
  const handleBack = () => { setStep((s) => Math.max(0, s - 1)); };
  const handleSubmit = () => {
    const values: any = {
      nfl_game_id: selectedGameId,
      wager_amount: wagerAmount,
      time_limit_seconds: timeLimit,
      mode: mode as ModeKey,
      player1_id: player1Id,
      player1_name: players.find(p => p.id === player1Id)?.name,
      player2_id: player2Id,
      player2_name: players.find(p => p.id === player2Id)?.name,
      stat,
      resolve_after: resolveAfter,
      description: mode === 'best_of_best'
        ? `Largest increase in ${stat} until ${resolveAfter}`
        : `1 Leg Spread — details TBD`
    };
    onSubmit(values);
  };

  return (
    <div className="bet-proposal-form">
      <div className="form-content">
        {stepContent()}
      </div>
      <div className="form-navigation">
        <button className="nav-button" type="button" onClick={handleBack} disabled={step === 0} aria-label="Previous step" title="Previous step">
          <IoIosArrowBack />
        </button>
        {canSubmit ? (
          <button className="submit-button" type="button" onClick={handleSubmit} disabled={loading} aria-label="Submit bet" title="Submit bet">Submit</button>
        ) : (
          <button className="nav-button" type="button" onClick={handleNext} disabled={!canNext} aria-label="Next step" title="Next step">
            <IoIosArrowForward />
          </button>
        )}
      </div>
    </div>
  );
};
