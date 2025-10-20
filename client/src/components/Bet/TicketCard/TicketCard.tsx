import React, { useEffect, useMemo, useState } from 'react';
import './TicketCard.css';
import type { Ticket } from '@features/bets/types';
import { extractModeConfig } from '@features/bets/mappers';
import BetStatus from '@shared/widgets/BetStatus/BetStatus';
import { formatToHundredth } from '@shared/utils/number';
import { useBetPhase } from '@shared/hooks/useBetPhase';
import { fetchModePreview, type ModePreviewPayload } from '@shared/api/modePreview';

export interface TicketCardProps {
  ticket: Ticket;
  onChangeGuess: (ticketId: string, newGuess: string) => void;
  onEnterTable: (tableId: string) => void;
}

const TicketCardComponent: React.FC<TicketCardProps> = ({ ticket, onChangeGuess, onEnterTable }) => {
  const modeKey = ticket.modeKey ? String(ticket.modeKey) : '';
  const modeConfig = useMemo(() => {
    const raw = extractModeConfig(ticket.betRecord ?? undefined);
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  }, [ticket.betRecord]);
  const modeConfigSignature = useMemo(() => JSON.stringify(modeConfig || {}), [modeConfig]);
  const [preview, setPreview] = useState<ModePreviewPayload | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!modeKey) {
      setPreview(null);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    setPreviewError(null);

    fetchModePreview(
      modeKey,
      modeConfig,
      ticket.betRecord?.nfl_game_id ?? null,
      (ticket.betRecord?.bet_id as string | undefined) ?? ticket.betId ?? null
    )
      .then((data) => {
        if (!cancelled) {
          setPreview(data);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          console.warn('[TicketCard] failed to load mode preview', error);
          setPreview(null);
          setPreviewError(error.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [modeKey, modeConfigSignature, ticket.betRecord?.nfl_game_id, ticket.betRecord?.bet_id, ticket.betId]);

  const summaryText = useMemo(() => {
    if (preview?.summary && preview.summary.trim().length) {
      return preview.summary;
    }
    if (ticket.betRecord?.description && ticket.betRecord.description.trim().length) {
      return ticket.betRecord.description;
    }
    if (ticket.betDetails && ticket.betDetails.trim().length) {
      return ticket.betDetails;
    }
    if (modeKey) {
      return modeKey.replace(/_/g, ' ');
    }
    return 'Bet';
  }, [preview?.summary, ticket.betRecord?.description, ticket.betDetails, modeKey]);

  const descriptionText = useMemo(() => {
    if (preview?.description && preview.description.trim().length) {
      return preview.description;
    }
    if (preview?.secondary && preview.secondary.trim().length) {
      return preview.secondary;
    }
    if (ticket.betRecord?.description && ticket.betRecord.description.trim().length) {
      return ticket.betRecord.description;
    }
    if (ticket.betDetails && ticket.betDetails.trim().length) {
      return ticket.betDetails;
    }
    return modeKey || 'Bet';
  }, [preview?.description, preview?.secondary, ticket.betRecord?.description, ticket.betDetails, modeKey]);

  const winningConditionText = useMemo(() => {
    if (preview?.winningCondition && preview.winningCondition.trim().length) {
      return preview.winningCondition;
    }
    if (previewError) {
      return 'Mode preview unavailable';
    }
    return null;
  }, [preview?.winningCondition, previewError]);

  const optionList = useMemo(() => {
    if (preview?.options && preview.options.length) {
      return preview.options
        .map((option) => (typeof option === 'string' ? option.trim() : ''))
        .filter((option): option is string => Boolean(option && option.length));
    }
    return ['pass'];
  }, [preview?.options]);
  const { phase, timeLeft } = useBetPhase({
    closeTime: ticket.closeTime || undefined,
    rawStatus: ticket.state,
    suppressTicks: true,
  });

  const normalizedTicketState = (ticket.state ?? '').toLowerCase();
  const normalizedPhase = (phase ?? '').toLowerCase();
  const isWashed = normalizedTicketState === 'washed' || normalizedPhase === 'washed';
  const isResolved = !isWashed && (normalizedTicketState === 'resolved' || normalizedPhase === 'resolved');
  const normalizedResult = (ticket.result ?? '').toLowerCase();
  const normalizedWinningChoice =
    ticket.winningChoice != null ? String(ticket.winningChoice).trim().toLowerCase() : null;
  const normalizedGuess = ticket.myGuess != null ? String(ticket.myGuess).trim().toLowerCase() : null;
  const hasGuess = Boolean(normalizedGuess && normalizedGuess.length > 0 && normalizedGuess !== 'pass');
  const isCorrectGuess = Boolean(
    isResolved && hasGuess && normalizedWinningChoice && normalizedGuess === normalizedWinningChoice
  );
  const isIncorrectGuess = Boolean(
    isResolved && hasGuess && normalizedWinningChoice && normalizedGuess !== normalizedWinningChoice
  );
  const stateClass = `state-${(ticket.state || phase).toLowerCase()}`;
  const resolvedOutcome: 'win' | 'loss' | null = (() => {
    if (!isResolved) return null;
    if (normalizedResult === 'win') return 'win';
    if (normalizedResult === 'loss') return 'loss';
    if (isCorrectGuess) return 'win';
    if (isIncorrectGuess) return 'loss';
    return null;
  })();
  const outcomeClass = (() => {
    if (isWashed || normalizedResult === 'washed') return 'outcome-washed';
    if (resolvedOutcome === 'win') return 'outcome-win';
    if (resolvedOutcome === 'loss') return 'outcome-loss';
    return '';
  })();
  const resolutionClass = isCorrectGuess ? 'guess-correct' : isIncorrectGuess ? 'guess-incorrect' : '';
  const cardClassName = ['ticket-card', stateClass, outcomeClass].filter(Boolean).join(' ');
  const betContainerClassName = ['bet-container', resolutionClass].filter(Boolean).join(' ');

  const Header = () => (
    <div className="ticket-card-header">
      <div className="ticket-header-left">
        <span className="bet-details">{summaryText}</span>
      </div>
      <div className="ticket-header-right">
        <BetStatus
          phase={phase}
          timeLeft={timeLeft}
          closeTime={ticket.closeTime || undefined}
          outcome={resolvedOutcome}
          className="ticket-status-repl"
        />
      </div>
    </div>
  );

  const Content = () => (
    <div className="ticket-card-content">
      <span className="game-context">{descriptionText}</span>
      {winningConditionText ? <span className="game-context-secondary">{winningConditionText}</span> : null}
    </div>
  );

  const Actions = () => (
    <div className="ticket-card-actions">
      <span className="ticket-finance">{formatToHundredth(ticket.wager)} pt(s)</span>
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
    return (
      <div className="ticket-bet-options">
  <div className={betContainerClassName}>
          <select
            className="bet-dropdown"
            value={ticket.myGuess}
            onChange={(e) => handleGuessChangeDropdown(ticket.id, e.target.value)}
            disabled={phase !== 'active'}
          >
            {optionList.map((opt) => (
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
    <button className="enter-table-btn" type="button" onClick={() => onEnterTable(ticket.tableId)}>
      {ticket.tableName} →
    </button>
  );

  return (
  <div className={cardClassName}>
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
