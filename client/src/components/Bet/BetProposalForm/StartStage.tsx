import React from 'react';
import type { League } from '@shared/types/bet';

interface GameOption {
  id: string;
  label: string;
}

interface ModeOption {
  key: string;
  label: string;
}

interface StartStageProps {
  gameId: string;
  onGameChange: (gameId: string) => void;
  modeKey: string;
  onModeChange: (modeKey: string) => void;
  games: GameOption[];
  modes: ModeOption[];
  league: League;
  isModeAvailable: (modeKey: string, league: League) => boolean;
  disabled?: boolean;
}

export const StartStage: React.FC<StartStageProps> = ({
  gameId,
  onGameChange,
  modeKey,
  onModeChange,
  games,
  modes,
  league,
  isModeAvailable,
  disabled,
}) => {
  const availableModes = modes.filter((mode) => isModeAvailable(mode.key, league));

  return (
    <div>
      <div className="form-group">
        <label className="form-label" htmlFor="league_game_id">
          Game
        </label>
        <select
          id="league_game_id"
          className="form-select"
          value={gameId}
          onChange={(e) => onGameChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">Select Game</option>
          {games.map((game) => (
            <option key={game.id} value={game.id}>
              {game.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="mode_key">
          Game Mode
        </label>
        <select
          id="mode_key"
          className="form-select"
          value={modeKey}
          onChange={(e) => onModeChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">Select Mode</option>
          {modes.map((mode) => {
            const available = isModeAvailable(mode.key, league);
            return (
              <option key={mode.key} value={mode.key} disabled={!available}>
                {mode.label}
              </option>
            );
          })}
        </select>
        {availableModes.length === 0 && (
          <div className="form-helper-text">No bet modes available for {league}.</div>
        )}
      </div>
    </div>
  );
};
