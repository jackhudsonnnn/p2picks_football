import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './TicketCard.css';
import type { Ticket } from '@features/bets/types';
import { extractModeConfig } from '@features/bets/mappers';
import BetStatus from '@shared/widgets/BetStatus/BetStatus';
import Modal from '@shared/widgets/Modal/Modal';
import { formatToHundredth } from '@shared/utils/number';
import { useBetPhase } from '@shared/hooks/useBetPhase';
import { fetchModePreview, fetchBetLiveInfo, type ModePreviewPayload, type BetLiveInfo, pokeBet } from '@features/bets/service';
import { HttpError } from '@data/clients/restClient';
import { useDialog } from '@shared/hooks/useDialog';
import infoIcon from '@assets/information.png';
import pokeIcon from '@assets/poke.png';

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
  const [isPoking, setIsPoking] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [liveInfo, setLiveInfo] = useState<BetLiveInfo | null>(null);
  const [liveInfoLoading, setLiveInfoLoading] = useState(false);
  const [liveInfoError, setLiveInfoError] = useState<string | null>(null);
  const { showAlert, showConfirm, dialogNode } = useDialog();

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

  // Fetch live info when modal opens
  useEffect(() => {
    if (!isInfoModalOpen) {
      return;
    }

    const betId = (ticket.betRecord?.bet_id as string | undefined) ?? ticket.betId ?? null;
    if (!betId) {
      setLiveInfoError('Unable to locate this bet');
      return;
    }

    let cancelled = false;
    setLiveInfoLoading(true);
    setLiveInfoError(null);

    fetchBetLiveInfo(betId)
      .then((data) => {
        if (!cancelled) {
          setLiveInfo(data);
          setLiveInfoLoading(false);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          console.warn('[TicketCard] failed to load live info', error);
          setLiveInfo(null);
          setLiveInfoError(error.message || 'Failed to load live info');
          setLiveInfoLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isInfoModalOpen, ticket.betRecord?.bet_id, ticket.betId]);

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
  const stateClass = `state-${(phase).toLowerCase()}`;
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
  const canPoke = isResolved || isWashed;

  const extractPokeErrorMessage = useCallback((error: unknown): string => {
    if (error instanceof HttpError) {
      const preview = error.bodyPreview;
      if (preview) {
        try {
          const parsed = JSON.parse(preview);
          if (parsed && typeof parsed.error === 'string' && parsed.error.trim().length) {
            return parsed.error;
          }
        } catch {
          // ignore JSON parse failures and fall back to message
        }
      }
      return error.message || 'Failed to poke bet.';
    }
    if (error instanceof Error) {
      return error.message || 'Failed to poke bet.';
    }
    return 'Failed to poke bet.';
  }, []);

  const handlePoke = useCallback(async () => {
    if (!canPoke || isPoking) {
      return;
    }
    const betId = (ticket.betRecord?.bet_id as string | undefined) ?? ticket.betId ?? null;
    if (!betId) {
      await showAlert({ title: 'Poke Bet', message: 'Unable to locate this bet.' });
      return;
    }

    setIsPoking(true);
    try {
      await pokeBet(betId);
      await showAlert({ title: 'Poke Bet', message: 'Bet poked successfully. A fresh proposal has been posted to the table.' });
    } catch (error) {
      await showAlert({ title: 'Poke Bet', message: extractPokeErrorMessage(error) });
    } finally {
      setIsPoking(false);
    }
  }, [canPoke, isPoking, ticket.betRecord?.bet_id, ticket.betId, extractPokeErrorMessage, showAlert]);

  const Header = () => (
    <div className="ticket-card-header">
      <div className="ticket-header-left">
        <div className="ticket-summary-row">
          <span className="bet-details">{summaryText}</span>
          <div className="ticket-header-actions">
            <button
              className="info-btn"
              type="button"
              onClick={() => setIsInfoModalOpen(true)}
              aria-label="More information"
            >
              <img src={infoIcon} alt="Info" className="info-icon" />
            </button>
            {canPoke ? (
              <button
                className="poke-icon-btn"
                type="button"
                onClick={handlePoke}
                disabled={isPoking}
                aria-label="Poke bet"
                title={isPoking ? 'Poking…' : 'Poke bet'}
              >
                <img src={pokeIcon} alt="Poke" className="poke-icon" />
              </button>
            ) : null}
          </div>
        </div>
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
    </div>
  );

  const Actions = () => (
    <div className="ticket-card-actions">
      <span className="ticket-finance">{formatToHundredth(ticket.wager)} pt(s)</span>
    </div>
  );

  const handleGuessChangeDropdown = async (ticketId: string, newGuess: string) => {
    if (ticket.myGuess !== newGuess) {
      const confirmed = await showConfirm({
        title: 'Change Guess',
        message: `Are you sure you want to change your guess to ${newGuess}?`,
        confirmLabel: 'Change',
      });
      if (confirmed) {
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
            value={ticket.myGuess ?? ''}
            onChange={(e) => {
              void handleGuessChangeDropdown(ticket.id, e.target.value);
            }}
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
    <>
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
      <Modal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        title={liveInfo?.modeLabel ?? 'Bet Information'}
      >
        {winningConditionText ? (
          <div className="live-info-winning-condition">
            <p className="live-info-winning-condition-text">{winningConditionText}</p>
          </div>
        ) : null}
        <div className="live-info-content">
          {liveInfoLoading && <div className="live-info-loading">Loading...</div>}
          {liveInfoError && <div className="live-info-error">{liveInfoError}</div>}
          {!liveInfoLoading && !liveInfoError && liveInfo && (
            <>
              {liveInfo.unavailableReason && (
                <div className="live-info-warning">{liveInfo.unavailableReason}</div>
              )}
              <div className="live-info-fields">
                {liveInfo.fields.map((field, index) => (
                  <div key={index} className="live-info-field">
                    <span className="live-info-label">{field.label}</span>
                    <span className="live-info-value">{field.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {!liveInfoLoading && !liveInfoError && !liveInfo && (
            <div className="live-info-empty">No live information available for this bet.</div>
          )}
        </div>
      </Modal>
      {dialogNode}
    </>
  );
};

const TicketCard = React.memo(TicketCardComponent);
TicketCard.displayName = 'TicketCard';

export default TicketCard;
