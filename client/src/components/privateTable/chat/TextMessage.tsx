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
  // Timer state for bet proposals
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [phase, setPhase] = useState<'active' | 'pending' | 'resolved'>('active');

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

  // Calculate and sync timer for bet proposals
  useEffect(() => {
    if (message.type !== "bet_proposal") return;
    const betMsg = message as BetProposalMessage;
    // Use betMsg.timestamp as proposal_time
    const proposalTime = new Date(betMsg.timestamp).getTime();
    const timeLimit = Number(betMsg.betDetails?.time_limit_seconds) || 0;
    if (!proposalTime || !timeLimit) return;

    const updateTimeLeft = () => {
      const now = Date.now();
      const activeEnds = proposalTime + timeLimit * 1000;
      const pendingEnds = activeEnds + 20_000; // mock resolution window
      if (now < activeEnds) {
        const left = Math.max(0, (activeEnds - now) / 1000);
        setTimeLeft(left);
        setPhase('active');
      } else if (now < pendingEnds) {
        setTimeLeft(0);
        setPhase('pending');
      } else {
        setTimeLeft(0);
        setPhase('resolved');
      }
    };
    updateTimeLeft();
    if (phase === 'resolved') return;
    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line
  }, [message, phase]);

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
    return (
      <div
        className={`message bet-proposal-message ${
          isOwnMessage ? "own-message" : "other-message"
        } clickable`}
        role="button"
        tabIndex={0}
        onClick={onBetClick}
        onKeyDown={onKeyDown}
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
