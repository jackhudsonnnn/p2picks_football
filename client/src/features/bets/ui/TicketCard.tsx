import React, { useEffect, useRef } from 'react';
import './TicketCard.css';
import type { Ticket } from '../types';
import { modeRegistry } from '../modeRegistry';

export interface TicketCardProps {
  ticket: Ticket;
  onChangeGuess: (ticketId: string, newGuess: string) => void;
  onEnterTable: (tableId: string) => void;
}

const TicketCardComponent: React.FC<TicketCardProps> = ({ ticket, onChangeGuess, onEnterTable }) => {
  // Refs for imperative timer & select disabling to avoid re-renders closing dropdown
  const timerRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const lastDisplayRef = useRef<string>('');

  useEffect(() => {
    if (ticket.state === 'active' && ticket.closeTime) {
      const closeAt = new Date(ticket.closeTime).getTime();
      const tick = () => {
        const remaining = Math.max(0, closeAt - Date.now());
        const seconds = remaining / 1000;
        const display = `${seconds.toFixed(1)}s`;
        if (timerRef.current && display !== lastDisplayRef.current) {
          timerRef.current.textContent = display;
          lastDisplayRef.current = display;
        }
        if (seconds <= 0 && selectRef.current) {
          selectRef.current.disabled = true;
        }
      };
      tick();
      const id = setInterval(tick, 200);
      return () => clearInterval(id);
    } else {
      // Non-active states
      if (timerRef.current) timerRef.current.textContent = ticket.state === 'active' ? '--' : '0.0s';
      if (selectRef.current) selectRef.current.disabled = ticket.state !== 'active';
    }
  }, [ticket.state, ticket.closeTime]);

  const formatDate = (dateString: string): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const displayState = (() => {
    if (ticket.state === 'active' && ticket.closeTime) {
      const closeAt = new Date(ticket.closeTime).getTime();
      const open = closeAt - Date.now() > 0;
      return open ? 'active' : 'Pending';
    }
    if (ticket.state === 'active') return 'active';
    return ticket.state.charAt(0).toUpperCase() + ticket.state.slice(1);
  })();

  const Header = () => (
    <div className="ticket-card-header">
      <div className="ticket-header-left">
        <span className="bet-details">{ticket.betDetails}</span>
        <span className="ticket-date">{formatDate(ticket.createdAt)}</span>
      </div>
      <div className="ticket-header-right">
        <span className={`ticket-status status-${displayState.toLowerCase()}`}>{displayState}</span>
        <span className="ticket-type">{ticket.tableName}</span>
      </div>
    </div>
  );

  const Content = () => (
    <div className="ticket-card-content">
      <span className="game-context">{ticket.modeKey}</span>
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
    // Timer
  const initialDisabled = ticket.state !== 'active';

    if (ticket.state === 'active' || ticket.state === 'pending') {
      // build options from mode registry
      const options = (() => {
        const key = (ticket.modeKey as any) || 'best_of_best';
        const def = modeRegistry[key as keyof typeof modeRegistry];
        if (!def) return ['pass'];
        const ctx: any = {
          modeConfig:
            key === 'best_of_best'
              ? {
                  player1_name: ticket.player1Name,
                  player2_name: ticket.player2Name,
                }
              : undefined,
        };
        return def.options(ctx);
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
            <div className="bet-timer" ref={timerRef}></div>
          </div>
        </div>
      );
    }

    return (
      <div className="ticket-results-info">
        <div className="guess-row">
          <span className="guess-label">Your pick: </span>
          <span className="guess-value">{ticket.myGuess}</span>
          <span className="guess-label"> | Result: </span>
          <span className="guess-value">{ticket.result ? ticket.result : 'N/A'}</span>
        </div>
      </div>
    );
  };

  const FooterRight = () => (
    <button className="enter-table-btn" onClick={() => onEnterTable(ticket.tableId)}>
      View Table →
    </button>
  );

  return (
    <div className={`ticket-card state-${ticket.state.toLowerCase()}`}>
      <Header />
      <Content />
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
// Memoize so unrelated parent state changes (like a global clock) don't close the open dropdown
const TicketCard = React.memo(TicketCardComponent);
TicketCard.displayName = 'TicketCard';

export default TicketCard;
