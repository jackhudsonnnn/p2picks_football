import React, { useEffect, useRef } from 'react';
import './TicketCard.css';
import type { Ticket } from '@features/bets/types';
import { modeRegistry } from '@features/bets/modes';
import BetStatus from '@shared/widgets/BetStatus/BetStatus';
import { useBetPhase } from '@shared/hooks/useBetPhase';

export interface TicketCardProps {
  ticket: Ticket;
  onChangeGuess: (ticketId: string, newGuess: string) => void;
  onEnterTable: (tableId: string) => void;
}

const TicketCardComponent: React.FC<TicketCardProps> = ({ ticket, onChangeGuess, onEnterTable }) => {
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const { phase, timeLeft } = useBetPhase({
    closeTime: ticket.closeTime || undefined,
    rawStatus: ticket.state,
    suppressTicks: true,
  });

  useEffect(() => {
    if (selectRef.current) selectRef.current.disabled = phase !== 'active';
  }, [phase]);

  const Header = () => (
    <div className="ticket-card-header">
      <div className="ticket-header-left">
        <span className="bet-details">{ticket.betDetails}</span>
      </div>
      <div className="ticket-header-right">
  <BetStatus phase={phase} timeLeft={timeLeft} closeTime={ticket.closeTime || undefined} className="ticket-status-repl" />
      </div>
    </div>
  );

  const Content = () => (
    <div className="ticket-card-content">
      <span className="game-context">{ticket.modeKey}</span>
    </div>
  );

  const Actions = () => (
    <div className="ticket-card-actions">
      <span className="ticket-finance">{ticket.wager} pt(s)</span>
    </div>
  );

  const handleGuessChangeDropdown = (ticketId: string, newGuess: string) => {
    if (ticket.myGuess !== newGuess) {
      if (window.confirm(`Are you sure you want to change your guess to ${newGuess}?`)) {
        onChangeGuess(ticketId, newGuess);
      }
    }
  };

  const FooterLeft = () => {
    const initialDisabled = phase !== 'active';

    const options = (() => {
      const key = (ticket.modeKey as any) || 'error';
      const def = modeRegistry[key as keyof typeof modeRegistry];
      if (!def) return ['pass'];
      return def.options({ bet: ticket.betRecord });
    })();
    return (
      <div className="ticket-bet-options">
        <div className="mobile-bet-container">
          <select
            ref={selectRef}
            className="mobile-bet-dropdown"
            value={ticket.myGuess}
            onChange={(e) => handleGuessChangeDropdown(ticket.id, e.target.value)}
            disabled={initialDisabled}
          >
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  const FooterRight = () => (
    <button className="enter-table-btn" onClick={() => onEnterTable(ticket.tableId)}>
      {ticket.tableName} →
    </button>
  );

  return (
    <div className={`ticket-card state-${(ticket.state || phase).toLowerCase()}`}>
      <Header />
      <Content />
      <Actions />
      <div className="ticket-card-footer">
        <div className="ticket-card-footer-left">
          <FooterLeft />
        </div>
        <div className="ticket-card-footer-right">
          <FooterRight />
        </div>
      </div>
    </div>
  );
};

const TicketCard = React.memo(TicketCardComponent);
TicketCard.displayName = 'TicketCard';

export default TicketCard;
