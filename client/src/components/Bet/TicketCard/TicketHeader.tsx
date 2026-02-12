import React from 'react';
import BetStatus from '@shared/widgets/BetStatus/BetStatus';

type Phase = 'active' | 'pending' | 'resolved' | 'washed';
type ResolvedOutcome = 'win' | 'loss' | 'washed';

interface TicketHeaderProps {
  summaryText: string;
  phase: Phase;
  timeLeft: number | null;
  closeTime?: string;
  resolvedOutcome?: ResolvedOutcome | null;
}

export const TicketHeader: React.FC<TicketHeaderProps> = React.memo(({
  summaryText,
  phase,
  timeLeft,
  closeTime,
  resolvedOutcome,
}) => (
  <div className="ticket-card-header">
    <div className="ticket-header-left">
      <div className="ticket-summary-row">
        <span className="bet-details">{summaryText}</span>
      </div>
    </div>
    <div className="ticket-header-right">
      <BetStatus
        phase={phase}
        timeLeft={timeLeft}
        closeTime={closeTime}
        outcome={resolvedOutcome}
        className="ticket-status-repl"
      />
    </div>
  </div>
));
