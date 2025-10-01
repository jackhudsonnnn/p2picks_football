import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "@features/auth";
import { acceptBetProposal, getBetProposalDetails, hasUserAcceptedBet } from '@features/bets/service';
import type { BetProposalMessage } from '@shared/types/chat';
import { supabase } from '@shared/api/supabaseClient';
import BetStatus from '@shared/widgets/BetStatus/BetStatus';
import './BetProposalCard.css';
import { useBetPhase } from '@shared/hooks/useBetPhase';

interface BetProposalCardProps {
  message: BetProposalMessage;
  isOwnMessage: boolean;
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
    let active = true;
    const load = async () => {
      const { count } = await supabase
        .from('bet_participations')
        .select('participation_id', { count: 'exact', head: true })
        .eq('bet_id', message.betProposalId);
      if (active && typeof count === 'number') setParticipants(count);
    };
    load();
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
  const betIdShort = message.betProposalId.slice(0, 8);

  const containerClasses = [
    'bet-proposal-card',
    `state-${phase}`,
    clickable ? 'is-clickable' : '',
    accepted ? 'is-joined' : '',
    'simple',
    clickable ? 'clickable' : '',
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
          <span className="bp-wager">{Number(message.betDetails.wager_amount).toFixed(0)} pt(s)</span>
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
