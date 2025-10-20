import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "@features/auth";
import { acceptBetProposal, hasUserAcceptedBet } from '@features/bets/service';
import type { BetProposalMessage } from '@shared/types/chat';
import { supabase } from '@shared/api/supabaseClient';
import BetStatus from '@shared/widgets/BetStatus/BetStatus';
import { formatToHundredth } from '@shared/utils/number';
import './BetProposalCard.css';
import { useBetPhase } from '@shared/hooks/useBetPhase';
import { formatTimeOfDay } from '@shared/utils/dateTime';

interface BetProposalCardProps {
  message: BetProposalMessage;
}

const BetProposalCard: React.FC<BetProposalCardProps> = ({ message }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [participants, setParticipants] = useState<number>(0);

  const { phase, timeLeft } = useBetPhase({
    closeTime: message.betDetails?.close_time,
    rawStatus: message.betDetails?.bet_status,
  });

  const description = message.betDetails?.description?.trim().length
    ? message.betDetails.description.trim()
    : 'No additional description provided.';
  const modeLabel = typeof message.betDetails?.mode_key === 'string' && message.betDetails.mode_key.trim().length
    ? message.betDetails.mode_key
        .split('_')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : 'Bet Mode';
  const timerDisplay = typeof message.betDetails?.time_limit_seconds === 'number'
    ? `${message.betDetails.time_limit_seconds}s timer`
    : null;
  const closeTimeText = message.betDetails?.close_time
    ? formatTimeOfDay(message.betDetails.close_time, { includeSeconds: true })
    : null;
  const winningConditionText = message.betDetails?.winning_condition_text ?? null;

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
        const { count, error } = await supabase
          .from('bet_participations')
          .select('participation_id', { count: 'exact', head: true })
          .eq('bet_id', message.betProposalId);
        if (error) throw error;
        if (active && typeof count === 'number') setParticipants(count);
      } catch (err) {
        console.warn('[BetProposalCard] failed to load participants', err);
        if (active) setParticipants(0);
      }
    };
    void load();
    const channel = supabase
      .channel(`bet_participants:${message.betProposalId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bet_participations', filter: `bet_id=eq.${message.betProposalId}` },
        () => load()
      )
      .subscribe();
    return () => {
      active = false;
      channel.unsubscribe();
    };
  }, [message.betProposalId]);

  const handleAccept = useCallback(async () => {
    if (!user) return;
    if (!message.tableId || !message.betProposalId) {
      alert('Table ID missing for this bet proposal.');
      return;
    }
    try {
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
  const betIdShort = message.betProposalId.slice(0, 8);

  const containerClasses = [
    'bet-proposal-card',
    `state-${phase}`,
    clickable ? 'is-clickable' : '',
    accepted ? 'is-joined' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={containerClasses}
      role={clickable ? 'button' : 'group'}
      tabIndex={clickable ? 0 : -1}
      onClick={clickable ? onBetClick : undefined}
      onKeyDown={clickable ? onKeyDown : undefined}
      aria-label={accepted ? 'Open tickets' : phase !== 'active' ? 'View tickets (not active)' : 'Accept bet'}
      data-bet-id={message.betProposalId}
    >
      {/* Header */}
      <div className="bp-header">
        <div className="bp-header-left">
          <span className="bp-id">#{betIdShort}</span>
          <span className="bp-wager">{formatToHundredth(message.betDetails.wager_amount)} pt(s)</span>
        </div>
        <div className="bp-header-right">
          <BetStatus phase={phase} timeLeft={timeLeft} />
          <span className="bp-participants">{participants} joined</span>
        </div>
      </div>

      {/* Footer */}
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
  );
};

export default BetProposalCard;
