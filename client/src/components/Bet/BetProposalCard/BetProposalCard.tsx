import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "@features/auth";
import { acceptBetProposal, hasUserAcceptedBet } from '@features/bets/service';
import type { BetProposalMessage } from '@shared/types/chat';
import { getBetParticipantCount } from '@data/repositories/betsRepository';
import { subscribeToBetParticipants } from '@data/subscriptions/tableSubscriptions';
import BetStatus from '@shared/widgets/BetStatus/BetStatus';
import { formatToHundredth } from '@shared/utils/number';
import './BetProposalCard.css';
import { useBetPhase } from '@shared/hooks/useBetPhase';
import { useDialog } from '@shared/hooks/useDialog';

interface BetProposalCardProps {
  message: BetProposalMessage;
}

const BetProposalCard: React.FC<BetProposalCardProps> = ({ message }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [participants, setParticipants] = useState<number>(0);
  const { showAlert, dialogNode } = useDialog();

  const { phase, timeLeft } = useBetPhase({
    closeTime: message.betDetails?.close_time,
    rawStatus: message.betDetails?.bet_status,
  });

  useEffect(() => {
    let mounted = true;
    const checkAccepted = async () => {
      if (user && message.betProposalId) {
        try {
          const hasAccepted = await hasUserAcceptedBet(message.betProposalId, user.id);
          if (mounted) setAccepted(hasAccepted);
        } catch {}
      }
    };
    checkAccepted();
    return () => {
      mounted = false;
    };
  }, [user, message.betProposalId]);

  useEffect(() => {
    if (!message.betProposalId) return;

    let active = true;
    const load = async () => {
      try {
        const count = await getBetParticipantCount(message.betProposalId);
        if (active) setParticipants(count);
      } catch {
        if (active) setParticipants(0);
      }
    };
    void load();
    const channel = subscribeToBetParticipants(message.betProposalId, () => load());
    return () => {
      active = false;
      channel.unsubscribe();
    };
  }, [message.betProposalId]);

  const handleAccept = useCallback(async () => {
    if (!user) return;
    if (!message.tableId || !message.betProposalId) {
      await showAlert({ title: 'Accept Bet', message: 'Table information is missing for this bet proposal.' });
      return;
    }
    try {
      await acceptBetProposal({ betId: message.betProposalId, tableId: message.tableId, userId: user.id });
      setAccepted(true);
      navigate('/tickets');
    } catch (error: unknown) {
      const message_ = error instanceof Error ? error.message : 'Unknown error';
      await showAlert({
        title: 'Accept Bet',
        message: `Failed to accept bet: ${message_}`,
      });
    }
  }, [user, message, navigate, showAlert]);

  const onBetClick = async () => {
    if (accepted || phase !== 'active') {
      navigate('/tickets');
      return;
    }
    await handleAccept();
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = async (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      await onBetClick();
    }
  };

  const clickable = phase === 'active' && !accepted;
  const betIdShort = message.betProposalId.slice(0, 8);

  const containerClasses = [
    'bet-proposal-card',
    `state-${phase}`,
    clickable ? 'is-clickable' : '',
    accepted ? 'is-joined' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div
      className={containerClasses}
      role={clickable ? 'button' : 'group'}
      tabIndex={clickable ? 0 : -1}
      onClick={clickable ? onBetClick : undefined}
      onKeyDown={clickable ? onKeyDown : undefined}
      aria-label={accepted ? 'Open tickets' : phase !== 'active' ? 'View tickets (not active)' : 'Accept bet'}
      data-bet-id={message.betProposalId}
    >
      <div className="bp-header">
        <div className="bp-header-left">
          <span className="bp-id">#{betIdShort}</span>
          <span className="bp-participants">{participants} viewed</span>
        </div>
        <div className="bp-header-right">
          <BetStatus phase={phase} timeLeft={timeLeft} />
          <span className="bp-wager">${formatToHundredth(message.betDetails.wager_amount)}</span>
        </div>
      </div>

      <div className="bp-footer">
        <div className="bp-footer-left">
          {clickable ? (
            <span className="bp-hint">Click to join</span>
          ) : (
            <span className="bp-hint inactive">{accepted ? 'View ticket' : 'Bet locked'}</span>
          )}
        </div>
        <div className="bp-footer-right">
          {accepted && <button className="bp-view-btn" onClick={() => navigate('/tickets')}>Tickets →</button>}
        </div>
      </div>
      </div>
      {dialogNode}
    </>
  );
};

export default BetProposalCard;
