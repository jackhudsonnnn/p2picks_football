import React from 'react';
import { Card } from '@shared/ui';
import type { Ticket } from '../types';
import { modeRegistry } from '../modeRegistry';

export interface TicketCardProps {
  ticket: Ticket;
  now: number;
  onChangeGuess: (ticketId: string, newGuess: string) => void;
  onEnterTable: (tableId: string) => void;
}

const TicketCard: React.FC<TicketCardProps> = ({ ticket, now, onChangeGuess, onEnterTable }) => {
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
    if (ticket.state === 'active') {
      if (ticket.closeTime) {
        const closeAt = new Date(ticket.closeTime).getTime();
        const remaining = Math.max(0, (closeAt - now) / 1000);
        return remaining > 0 ? 'active' : 'Pending';
      }
      return 'active';
    }
    return ticket.state.charAt(0).toUpperCase() + ticket.state.slice(1);
  })();

  const renderHeader = () => (
    <>
      <div className="ticket-header-left">
        <span className="bet-details">{ticket.betDetails}</span>
        <span className="ticket-date">{formatDate(ticket.createdAt)}</span>
      </div>
      <div className="ticket-header-right">
        <span className={`ticket-status status-${displayState.toLowerCase()}`}>{displayState}</span>
        <span className="ticket-type">{ticket.tableName}</span>
      </div>
    </>
  );

  const renderContent = () => <span className="game-context">{ticket.modeKey}</span>;

  const handleGuessChangeDropdown = (ticketId: string, newGuess: string) => {
    if (ticket.myGuess !== newGuess) {
      if (window.confirm(`Are you sure you want to change your guess to ${newGuess}?`)) {
        onChangeGuess(ticketId, newGuess);
      }
    }
  };

  const renderFooterLeft = () => {
    // Timer
    let timerDisplay = '--';
    if (ticket.state === 'active' && ticket.closeTime) {
      const closeAt = new Date(ticket.closeTime).getTime();
      const remaining = Math.max(0, (closeAt - now) / 1000);
      timerDisplay = `${remaining.toFixed(1)}s`;
      if (remaining <= 0) timerDisplay = '0.0s';
    } else if (ticket.state !== 'active') {
      timerDisplay = '0.0s';
    }

    // Disable inputs if pending or closed
    let disabled = false;
    if (ticket.state === 'active' && ticket.closeTime) {
      const closeAt = new Date(ticket.closeTime).getTime();
      const remaining = Math.max(0, (closeAt - now) / 1000);
      disabled = remaining <= 0;
    } else if (ticket.state !== 'active') {
      disabled = true;
    }

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
              className="mobile-bet-dropdown"
              value={ticket.myGuess}
              onChange={(e) => handleGuessChangeDropdown(ticket.id, e.target.value)}
              disabled={disabled}
            >
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <div className="bet-timer">{timerDisplay}</div>
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

  const renderFooterRight = () => (
    <button className="enter-table-btn" onClick={() => onEnterTable(ticket.tableId)}>
      View Table →
    </button>
  );

  return (
    <Card
      data={ticket}
      renderHeader={renderHeader}
      renderContent={renderContent}
      renderFooterLeft={renderFooterLeft}
      renderFooterRight={renderFooterRight}
      stateClass={ticket.state.toLowerCase()}
    />
  );
};

export default TicketCard;
