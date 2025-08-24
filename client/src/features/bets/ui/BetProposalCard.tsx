import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "@features/auth";
import { acceptBetProposal, getBetProposalDetails, hasUserAcceptedBet } from '../service';
import type { BetProposalMessage } from '@/types/api';
import './BetProposalCard.css';

interface BetProposalCardProps {
  message: BetProposalMessage;
  isOwnMessage: boolean;
}

const BetProposalCard: React.FC<BetProposalCardProps> = ({ message, isOwnMessage }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [phase, setPhase] = useState<'active' | 'pending' | 'resolved' | 'washed'>('active');

  // initial accepted state
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

  // timer/phase updater
  useEffect(() => {
    const closeAt = message.betDetails?.close_time
      ? new Date(message.betDetails.close_time).getTime()
      : null;

    const computePhaseFromStatus = (status?: string) => {
      switch (status) {
        case 'pending':
          return 'pending' as const;
        case 'resolved':
          return 'resolved' as const;
        case 'washed':
          return 'washed' as const;
        case 'active':
        default:
          return 'active' as const;
      }
    };

    const update = () => {
      const status = message.betDetails?.bet_status;
      if (status && status !== 'active') {
        setPhase(computePhaseFromStatus(status));
        setTimeLeft(0);
        return;
      }
      if (closeAt) {
        const now = Date.now();
        if (now < closeAt) {
          setPhase('active');
          setTimeLeft(Math.max(0, (closeAt - now) / 1000));
        } else {
          setPhase('pending');
          setTimeLeft(0);
        }
      } else {
        setPhase(computePhaseFromStatus(message.betDetails?.bet_status));
        setTimeLeft(null);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [message]);

  const handleAccept = useCallback(async () => {
    if (!user) return;
    if (!message.tableId) {
      alert('Table ID missing for this bet proposal.');
      return;
    }
    try {
      await getBetProposalDetails(message.betProposalId);
      await acceptBetProposal({ betId: message.betProposalId, tableId: message.tableId, userId: user.id });
      setAccepted(true);
      navigate('/tickets');
    } catch (error: any) {
      alert(`Failed to accept bet: ${error?.message ?? 'Unknown error'}`);
    }
  }, [user, message, navigate]);

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

  return (
    <div
      className={`message bet-proposal-message ${isOwnMessage ? 'own-message' : 'other-message'} ${clickable ? 'clickable' : ''}`}
      role="button"
      tabIndex={0}
      onClick={clickable ? onBetClick : undefined}
      onKeyDown={clickable ? onKeyDown : undefined}
      aria-label={
        accepted ? 'Open tickets' : phase !== 'active' ? 'View tickets (not active)' : 'Accept bet'
      }
    >
      <div className="bet-proposal-content bet-proposal-flex">
        <div className="bet-proposal-info">
          <div className="wager-amount">Wager: {Number(message.betDetails.wager_amount).toFixed(0)} pts</div>
          <div className="game-context">{message.betDetails.mode_key}</div>
        </div>
        <div className="bet-actions bet-actions-flex-end">
          <div className="bet-timer">
            {phase === 'active' && timeLeft !== null
              ? `${timeLeft.toFixed(1)}s`
              : phase === 'pending'
              ? 'Pending'
              : phase === 'washed'
              ? 'Washed'
              : 'Resolved'}
          </div>
        </div>
      </div>
      <div className="bet-details bet-details-full">{message.text}</div>
    </div>
  );
};

export default BetProposalCard;
