import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './TicketCard.css';
import type { Ticket } from '@features/bets/types';
import BetStatus from '@shared/widgets/BetStatus/BetStatus';
import { Modal } from '@shared/widgets/Modal/Modal';
import { formatToHundredth } from '@shared/utils/number';
import { useBetPhase } from '@shared/hooks/useBetPhase';
import { useDialog } from '@shared/hooks/useDialog';
import { useModePreview } from '@features/bets/hooks/useModePreview';
import { useBetLiveInfo } from '@features/bets/hooks/useBetLiveInfo';
import { usePokeBet } from '@features/bets/hooks/usePokeBet';
import { useValidateBet } from '@features/bets/hooks/useValidateBet';
import { buildTicketTexts, computeTicketOutcome, getModeConfig, getModeKeyString } from '@features/bets/utils/ticketHelpers';
import infoIcon from '@assets/information.png';
import pokeIcon from '@assets/poke.png';
import validateIcon from '@assets/validate.png';

export interface TicketCardProps {
  ticket: Ticket;
  onChangeGuess: (ticketId: string, newGuess: string) => void;
  onEnterTable: (tableId: string) => void;
}

const TicketCardComponent: React.FC<TicketCardProps> = ({ ticket, onChangeGuess, onEnterTable }) => {
  const modeKey = useMemo(() => getModeKeyString(ticket), [ticket.modeKey]);
  const modeConfig = useMemo(() => getModeConfig(ticket) || {}, [ticket.betRecord]);
  const betId = useMemo(
    () => (ticket.betRecord?.bet_id as string | undefined) ?? ticket.betId ?? null,
    [ticket.betRecord?.bet_id, ticket.betId]
  );
  const { preview, error: previewError } = useModePreview({
    modeKey,
    modeConfig,
    leagueGameId: ticket.betRecord?.league_game_id ?? "-1",
    league: ticket.betRecord?.league ?? 'U2Pick',
    betId,
  });
  const leagueLabel = ticket.betRecord?.league ?? 'U2Pick';
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isValidateModalOpen, setIsValidateModalOpen] = useState(false);
  const [selectedWinningChoice, setSelectedWinningChoice] = useState<string>('');
  const { liveInfo, loading: liveInfoLoading, error: liveInfoError } = useBetLiveInfo({
    betId,
    enabled: isInfoModalOpen,
  });
  const { poke, isPoking, getErrorMessage } = usePokeBet();
  const { validate, isValidating, getErrorMessage: getValidateErrorMessage } = useValidateBet();
  const { showAlert, showConfirm, dialogNode } = useDialog();

  const { summaryText, winningConditionText, optionList } = useMemo(
    () => buildTicketTexts(ticket, preview, previewError),
    [ticket, preview, previewError]
  );
  const { phase, timeLeft } = useBetPhase({
    closeTime: ticket.closeTime || undefined,
    rawStatus: ticket.state,
    suppressTicks: true,
  });

  const outcomeInfo = useMemo(() => computeTicketOutcome(ticket, phase), [ticket, phase]);
  const stateClass = `state-${(phase || '').toLowerCase()}`;
  const cardClassName = useMemo(
    () => ['ticket-card', stateClass, outcomeInfo.outcomeClass].filter(Boolean).join(' '),
    [stateClass, outcomeInfo.outcomeClass]
  );
  const betContainerClassName = useMemo(
    () => ['bet-container', outcomeInfo.resolutionClass].filter(Boolean).join(' '),
    [outcomeInfo.resolutionClass]
  );
  const canPoke = outcomeInfo.isResolved || outcomeInfo.isWashed;
  
  // U2Pick bets can be validated when pending
  const isU2Pick = leagueLabel === 'U2Pick';
  const canValidate = isU2Pick && phase === 'pending' && !outcomeInfo.isResolved && !outcomeInfo.isWashed;
  
  // Get options for validation (exclude "No Entry")
  const validationOptions = useMemo(() => {
    if (!canValidate) return [];
    return optionList.filter((opt) => opt !== 'No Entry' && opt.trim().length > 0);
  }, [canValidate, optionList]);

  const handlePoke = useCallback(async () => {
    if (!canPoke || isPoking) {
      return;
    }

    if (!betId) {
      await showAlert({ title: 'Poke Bet', message: 'Unable to locate this bet.' });
      return;
    }

    try {
      await poke(betId);
      await showAlert({
        title: 'Poke Bet',
        message: 'Bet poked successfully. A fresh proposal has been posted to the table.',
      });
    } catch (error) {
      await showAlert({ title: 'Poke Bet', message: getErrorMessage(error) });
    }
  }, [canPoke, isPoking, betId, showAlert, poke, getErrorMessage]);

  const handleOpenValidateModal = useCallback(() => {
    if (validationOptions.length > 0) {
      setSelectedWinningChoice(validationOptions[0]);
    }
    setIsValidateModalOpen(true);
  }, [validationOptions]);

  const handleValidate = useCallback(async () => {
    if (!canValidate || isValidating) {
      return;
    }

    if (!betId) {
      await showAlert({ title: 'Validate Bet', message: 'Unable to locate this bet.' });
      return;
    }

    if (!selectedWinningChoice) {
      await showAlert({ title: 'Validate Bet', message: 'Please select a winning choice.' });
      return;
    }

    const confirmed = await showConfirm({
      title: 'Validate Bet',
      message: `Are you sure "${selectedWinningChoice}" is the correct answer? This action cannot be undone.`,
      confirmLabel: 'Validate',
    });

    if (!confirmed) return;

    try {
      await validate(betId, selectedWinningChoice);
      setIsValidateModalOpen(false);
      await showAlert({
        title: 'Bet Validated',
        message: `The bet has been resolved with "${selectedWinningChoice}" as the winning choice.`,
      });
    } catch (error) {
      await showAlert({ title: 'Validate Bet', message: getValidateErrorMessage(error) });
    }
  }, [canValidate, isValidating, betId, selectedWinningChoice, showAlert, showConfirm, validate, getValidateErrorMessage]);

  const Header = () => (
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
          closeTime={ticket.closeTime || undefined}
          outcome={outcomeInfo.resolvedOutcome}
          className="ticket-status-repl"
        />
      </div>
    </div>
  );

  const Content = () => (
    <div className="ticket-card-content">
      <div className="ticket-description-row">
        <span className="game-context">{leagueLabel}</span>
        <div className="ticket-description-actions">
          <button
            className="info-icon-btn"
            type="button"
            onClick={() => setIsInfoModalOpen(true)}
            aria-label="More information"
          >
            <img src={infoIcon} alt="Info" className="icon" />
          </button>
          {canValidate ? (
            <button
              className="validate-icon-btn"
              type="button"
              onClick={handleOpenValidateModal}
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
              onClick={handlePoke}
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
  );

  const Actions = () => (
    <div className="ticket-card-actions">
      <span className="ticket-finance">${formatToHundredth(ticket.wager)}</span>
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
    const isActive = phase === 'active';
    const currentValue = ticket.myGuess ?? '';
    const containerRef = useRef<HTMLDivElement>(null);
    const spanRef = useRef<HTMLSpanElement>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const [scrollStyle, setScrollStyle] = useState<React.CSSProperties>({});

    // Pixels per second for constant velocity scrolling
    const SCROLL_SPEED = 10;

    useEffect(() => {
      const checkOverflow = () => {
        if (containerRef.current && spanRef.current) {
          // Get the actual content area by subtracting padding
          const style = getComputedStyle(containerRef.current);
          const paddingLeft = parseFloat(style.paddingLeft) || 0;
          const paddingRight = parseFloat(style.paddingRight) || 0;
          const availableWidth = containerRef.current.clientWidth - paddingLeft - paddingRight;
          const textWidth = spanRef.current.scrollWidth;
          const overflowAmount = textWidth - availableWidth;
          
          if (overflowAmount > 0) {
            setIsOverflowing(true);
            // Calculate duration based on overflow distance for constant velocity
            const duration = overflowAmount / SCROLL_SPEED;
            setScrollStyle({
              '--scroll-duration': `${duration + 2}s`, // Add 2s for pause time
              '--scroll-distance': `-${overflowAmount}px`,
            } as React.CSSProperties);
          } else {
            setIsOverflowing(false);
            setScrollStyle({});
          }
        }
      };
      checkOverflow();
      window.addEventListener('resize', checkOverflow);
      return () => window.removeEventListener('resize', checkOverflow);
    }, [currentValue]);

    const readonlyClassName = ['bet-dropdown-readonly', isOverflowing && 'is-overflowing']
      .filter(Boolean)
      .join(' ');

    return (
      <div className="ticket-bet-options">
        <div className={betContainerClassName}>
          {isActive ? (
            <select
              className="bet-dropdown"
              value={currentValue}
              onChange={(e) => {
                void handleGuessChangeDropdown(ticket.id, e.target.value);
              }}
            >
              {optionList.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <div
              ref={containerRef}
              className={readonlyClassName}
              style={scrollStyle}
              aria-disabled="true"
              role="textbox"
              tabIndex={-1}
            >
              <span ref={spanRef}>{currentValue || 'No guess'}</span>
            </div>
          )}
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
        <div>
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
      <Modal
        isOpen={isValidateModalOpen}
        onClose={() => setIsValidateModalOpen(false)}
        title="Validate Bet"
        footer={
          <div className="validate-modal-footer">
            <button
              className="validate-cancel-btn"
              type="button"
              onClick={() => setIsValidateModalOpen(false)}
              disabled={isValidating}
            >
              Cancel
            </button>
            <button
              className="validate-confirm-btn"
              type="button"
              onClick={handleValidate}
              disabled={isValidating || !selectedWinningChoice}
            >
              {isValidating ? 'Validating…' : 'Validate'}
            </button>
          </div>
        }
      >
        <div className="validate-modal-content">
          {winningConditionText ? (
            <div className="validate-winning-condition">
              <p className="validate-winning-condition-label">Winning Condition:</p>
              <p className="validate-winning-condition-text">{winningConditionText}</p>
            </div>
          ) : null}
          <div className="validate-choice-section">
            <label htmlFor="winning-choice-select" className="validate-choice-label">
              Select the winning choice:
            </label>
            <select
              id="winning-choice-select"
              className="validate-choice-select"
              value={selectedWinningChoice}
              onChange={(e) => setSelectedWinningChoice(e.target.value)}
              disabled={isValidating}
            >
              {validationOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <p className="validate-warning">
            This action cannot be undone. Make sure you select the correct answer.
          </p>
        </div>
      </Modal>
      {dialogNode}
    </>
  );
};

const TicketCard = React.memo(TicketCardComponent);
TicketCard.displayName = 'TicketCard';

export default TicketCard;
