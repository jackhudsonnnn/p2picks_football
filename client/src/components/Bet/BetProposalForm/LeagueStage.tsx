import React, { useState } from 'react';
import { Modal } from '@shared/widgets/Modal/Modal';
import type { League } from '@shared/types/bet';

const ALL_LEAGUES = ['U2Pick', 'NFL', 'NBA', 'MLB', 'NHL', 'NCAAF'] as const;

interface LeagueStageProps {
  league: League;
  activeLeagues: League[];
  onLeagueChange: (league: League) => void;
  disabled?: boolean;
}

export const LeagueStage: React.FC<LeagueStageProps> = ({
  league,
  activeLeagues,
  onLeagueChange,
  disabled,
}) => {
  const [showModal, setShowModal] = useState(false);
  const inactiveLeagues = ALL_LEAGUES.filter(
    (l) => !activeLeagues.includes(l as League),
  );

  const handleChange = (value: string) => {
    const isActive = activeLeagues.includes(value as League);
    if (!isActive) {
      setShowModal(true);
      return;
    }
    onLeagueChange(value as League);
  };

  return (
    <div>
      <div className="form-group">
        <label className="form-label" htmlFor="league">
          Choose League
        </label>
        <select
          id="league"
          className="form-select"
          value={league}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
        >
          {ALL_LEAGUES.map((value) => {
            const isActive = activeLeagues.includes(value as League);
            return (
              <option key={value} value={value} disabled={!isActive}>
                {value}
              </option>
            );
          })}
        </select>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="More leagues coming soon"
        footer={
          <button
            className="submit-button"
            type="button"
            onClick={() => setShowModal(false)}
          >
            Got it
          </button>
        }
      >
        <p>
          {inactiveLeagues.length > 0
            ? `${inactiveLeagues.join(', ')} ${inactiveLeagues.length === 1 ? 'is' : 'are'} on the roadmap.`
            : 'All leagues are currently available!'}
        </p>
      </Modal>
    </div>
  );
};
