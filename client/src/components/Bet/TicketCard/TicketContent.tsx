import React from 'react';
import infoIcon from '@assets/information.png';
import pokeIcon from '@assets/poke.png';
import validateIcon from '@assets/validate.png';

interface TicketContentProps {
  leagueLabel: string;
  canValidate: boolean;
  canPoke: boolean;
  isValidating: boolean;
  isPoking: boolean;
  onOpenInfo: () => void;
  onOpenValidate: () => void;
  onPoke: () => void;
}

export const TicketContent: React.FC<TicketContentProps> = React.memo(({
  leagueLabel,
  canValidate,
  canPoke,
  isValidating,
  isPoking,
  onOpenInfo,
  onOpenValidate,
  onPoke,
}) => (
  <div className="ticket-card-content">
    <div className="ticket-description-row">
      <span className="game-context">{leagueLabel}</span>
      <div className="ticket-description-actions">
        <button
          className="info-icon-btn"
          type="button"
          onClick={onOpenInfo}
          aria-label="More information"
        >
          <img src={infoIcon} alt="Info" className="icon" />
        </button>
        {canValidate ? (
          <button
            className="validate-icon-btn"
            type="button"
            onClick={onOpenValidate}
            disabled={isValidating}
            aria-label="Validate bet"
            title={isValidating ? 'Validating…' : 'Validate bet'}
          >
            <img src={validateIcon} alt="Validate" className="icon" />
          </button>
        ) : null}
        {canPoke ? (
          <button
            className="poke-icon-btn"
            type="button"
            onClick={onPoke}
            disabled={isPoking}
            aria-label="Poke bet"
            title={isPoking ? 'Poking…' : 'Poke bet'}
          >
            <img src={pokeIcon} alt="Poke" className="icon" />
          </button>
        ) : null}
      </div>
    </div>
  </div>
));
