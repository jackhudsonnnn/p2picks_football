import React, { useEffect, useRef } from 'react';
import './TicketCard.css';
import type { Ticket } from '@features/bets/types';
import { modeRegistry } from '@features/bets/modes';
import { formatDateTime } from '@shared/utils/dateTime';

export interface TicketCardProps {
  ticket: Ticket;
  onChangeGuess: (ticketId: string, newGuess: string) => void;
  onEnterTable: (tableId: string) => void;
}

const TicketCardComponent: React.FC<TicketCardProps> = ({ ticket, onChangeGuess, onEnterTable }) => {
  const timerRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const lastDisplayRef = useRef<string>('');

  useEffect(() => {
    if (ticket.state === 'active' && ticket.closeTime) {
      const closeAt = new Date(ticket.closeTime).getTime();
      let intervalId: ReturnType<typeof setInterval> | null = null;
      const tick = () => {
        const remaining = Math.max(0, closeAt - Date.now());
        const seconds = remaining / 1000;
        if (seconds > 0) {
          const display = `${seconds.toFixed(1)}s`;
          if (timerRef.current && display !== lastDisplayRef.current) {
            timerRef.current.textContent = display;
            lastDisplayRef.current = display;
          }
        } else {
          // Timer expired: mark as Pending visually & disable input
          if (timerRef.current && lastDisplayRef.current !== 'Pending') {
            timerRef.current.textContent = 'Pending';
            lastDisplayRef.current = 'Pending';
          }
          if (selectRef.current) selectRef.current.disabled = true;
          if (intervalId) clearInterval(intervalId);
        }
      };
      tick();
      intervalId = setInterval(tick, 100);
      return () => {
        if (intervalId) clearInterval(intervalId);
      };
    } else {
      // Non-active states
      if (timerRef.current) timerRef.current.textContent = '0.0s';
      if (selectRef.current) selectRef.current.disabled = ticket.state !== 'active';
    }
  }, [ticket.state, ticket.closeTime]);

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
        <span className="ticket-date">{formatDateTime(ticket.createdAt, { includeTime: true }) || 'N/A'}</span>
      </div>
      <div className="ticket-header-right">
        {/* For active tickets, this span becomes the countdown timer. Other states show their status label. */}
        <span
          className={`ticket-status status-${displayState.toLowerCase()}`}
          ref={timerRef}
        >
          {ticket.state === 'active' ? '--' : displayState}
        </span>
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
          </div>
        </div>
      );
    }

    return (
      <div className="ticket-results-info">
        <div className="guess-row">
          <span className="guess-label">Your pick: </span>
          <span className="guess-value">{ticket.myGuess}</span>
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

const TicketCard = React.memo(TicketCardComponent);
TicketCard.displayName = 'TicketCard';

export default TicketCard;
