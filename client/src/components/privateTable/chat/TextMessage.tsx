import React, { useEffect, useState, useCallback } from "react";
import "./TextMessage.css";
import { BetProposalMessage } from "../../../types/api";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../hooks/useAuth";
import {
  acceptBetProposal,
  hasUserAcceptedBet,
  getBetProposalDetails,
} from "../../../services/betService";

// Message Types
export type MessageType = "chat" | "system" | "bet_proposal";

export interface Message {
  id: string;
  type: MessageType;
  senderUserId: string;
  senderUsername: string;
  text: string;
  timestamp: string;
  betProposalId?: string;
  tableId?: string;
}

interface TextMessageProps {
  message: Message;
  isOwnMessage: boolean;
  formatTimestamp: (timestamp: string) => string;
}

const TextMessage: React.FC<TextMessageProps> = ({
  message,
  isOwnMessage,
  formatTimestamp,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [accepted, setAccepted] = useState(false);
  // Timer/phase state for bet proposals (driven by DB)
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [phase, setPhase] = useState<'active' | 'pending' | 'resolved' | 'washed'>('active');

  useEffect(() => {
    let mounted = true;
    const checkAccepted = async () => {
      if (message.type === "bet_proposal" && user && message.betProposalId) {
        try {
          const hasAccepted = await hasUserAcceptedBet(
            message.betProposalId,
            user.id
          );
          if (mounted) setAccepted(hasAccepted);
        } catch {
          // Optionally handle error
        }
      }
    };
    checkAccepted();
    return () => {
      mounted = false;
    };
  }, [user, message.type, message.betProposalId]);

  // Calculate and sync timer/status for bet proposals using DB fields
  useEffect(() => {
    if (message.type !== "bet_proposal") return;
    const betMsg = message as BetProposalMessage;
    const closeAt = betMsg.betDetails?.close_time
      ? new Date(betMsg.betDetails.close_time).getTime()
      : null;

    const computePhaseFromStatus = (status: string | undefined) => {
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
      const status = betMsg.betDetails?.bet_status;
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
          // If past close_time but status still 'active' locally, show pending until feed refresh updates status
          setPhase('pending');
          setTimeLeft(0);
        }
      } else {
        // No close_time available; fallback to status
        setPhase(computePhaseFromStatus(betMsg.betDetails?.bet_status));
        setTimeLeft(null);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line
  }, [message]);

  // Handlers
  const handleAccept = useCallback(
    async (betMsg: BetProposalMessage) => {
      if (!user) return;
      if (!betMsg.tableId) {
        alert("Table ID missing for this bet proposal.");
        return;
      }
      try {
        // Optional: pre-check bet status
        await getBetProposalDetails(betMsg.betProposalId);
        await acceptBetProposal({
          betId: betMsg.betProposalId,
          tableId: betMsg.tableId,
          userId: user.id,
        });
        setAccepted(true);
        navigate("/bets-history");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        alert(`Failed to accept bet: ${errorMessage}`);
      }
    },
    [user, navigate]
  );

  // Removed explicit buttons; navigation happens on container click

  // Render bet proposal message
  if (message.type === "bet_proposal") {
    const betMsg = message as BetProposalMessage;
    const onBetClick = async () => {
  // If already accepted or no longer active, go to tickets
  if (accepted || phase !== 'active') {
        navigate("/bets-history");
        return;
      }
      // Otherwise accept (defaults to 'pass') and navigate
      await handleAccept(betMsg);
    };

    const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = async (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        await onBetClick();
      }
    };
    const clickable = phase === 'active' && !accepted;
    return (
      <div
        className={`message bet-proposal-message ${
          isOwnMessage ? "own-message" : "other-message"
        } ${clickable ? 'clickable' : ''}`}
        role="button"
        tabIndex={0}
        onClick={clickable ? onBetClick : undefined}
        onKeyDown={clickable ? onKeyDown : undefined}
        aria-label={
          accepted
            ? "Open tickets"
            : phase !== 'active'
            ? "View tickets (not active)"
            : "Accept bet"
        }
      >
        <div className="bet-proposal-content bet-proposal-flex">
          <div className="bet-proposal-info">
            <div className="wager-amount">
              Wager: {Number(betMsg.betDetails.wager_amount).toFixed(0)} pts
            </div>
            <div className="game-context">
              {betMsg.betDetails.mode_key}
            </div>
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
        <div className="bet-details bet-details-full">
          {betMsg.text}
        </div>
      </div>
    );
  }

  // Render chat or system message
  return (
    <div
      className={`message ${message.type} ${
        isOwnMessage ? "own-message" : "other-message"
      }`}
    >
      {message.type === "system" ? (
        <div className="system-message">{message.text}</div>
      ) : (
        <div className="chat-message">
          <div className="message-header">
            <span className="sender-name">{message.senderUsername}</span>
            <span className="message-time">
              {formatTimestamp(message.timestamp)}
            </span>
          </div>
          <p className="message-text">{message.text}</p>
        </div>
      )}
    </div>
  );
};

export default TextMessage;
