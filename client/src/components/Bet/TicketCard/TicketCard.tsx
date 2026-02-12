import React, { useCallback, useMemo, useState } from 'react';
import './TicketCard.css';
import type { Ticket } from '@features/bets/types';
import { Modal } from '@shared/widgets/Modal/Modal';
import { formatToHundredth } from '@shared/utils/number';
import { useBetPhase } from '@shared/hooks/useBetPhase';
import { useDialog } from '@shared/hooks/useDialog';
import { useModePreview } from '@features/bets/hooks/useModePreview';
import { useBetLiveInfo } from '@features/bets/hooks/useBetLiveInfo';
import { usePokeBet } from '@features/bets/hooks/usePokeBet';
import { useValidateBet } from '@features/bets/hooks/useValidateBet';
import { buildTicketTexts, computeTicketOutcome, getModeConfig, getModeKeyString } from '@features/bets/utils/ticketHelpers';
import { TicketHeader } from './TicketHeader';
import { TicketContent } from './TicketContent';
import { TicketFooterLeft } from './TicketFooterLeft';

interface TicketCardProps {
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
    <TicketHeader
      summaryText={summaryText}
      phase={phase}
      timeLeft={timeLeft}
      closeTime={ticket.closeTime || undefined}
      resolvedOutcome={outcomeInfo.resolvedOutcome}
    />
  );

  const Content = () => (
    <TicketContent
      leagueLabel={leagueLabel}
      canValidate={canValidate}
      canPoke={canPoke}
      isValidating={isValidating}
      isPoking={isPoking}
      onOpenInfo={() => setIsInfoModalOpen(true)}
      onOpenValidate={handleOpenValidateModal}
      onPoke={handlePoke}
    />
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

  const FooterLeft = () => (
    <TicketFooterLeft
      isActive={phase === 'active'}
      currentValue={ticket.myGuess ?? ''}
      optionList={optionList}
      betContainerClassName={betContainerClassName}
      onGuessChange={(newGuess) => {
        void handleGuessChangeDropdown(ticket.id, newGuess);
      }}
    />
  );

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
                {liveInfo.fields.map((field) => (
                  <div key={field.label} className="live-info-field">
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
