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
  const [settled, setSettled] = useState(false);

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
      const elapsed = (now - proposalTime) / 1000; // seconds
      const left = Math.max(0, timeLimit - elapsed);
      setTimeLeft(left);
      setSettled(left <= 0);
    };
    updateTimeLeft();
    if (settled) return;
    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line
  }, [message, settled]);

  // Handlers
  const handleAccept = useCallback(
    async (betMsg: BetProposalMessage) => {
      if (!user) return;
      if (!betMsg.tableId) {
        alert("Table ID missing for this bet proposal.");
        return;
      }
      try {
        console.log("Accepting bet proposal:", betMsg.betProposalId);
        console.log("Debug info:", {
          betId: betMsg.betProposalId,
          tableId: betMsg.tableId,
          userId: user.id,
          userAuthId: user.id
        });
        
        // Debug: Check bet proposal details
        const betDetails = await getBetProposalDetails(betMsg.betProposalId);
        console.log("Bet proposal details:", betDetails);
        
        await acceptBetProposal({
          betId: betMsg.betProposalId,
          tableId: betMsg.tableId,
          userId: user.id,
        });
        setAccepted(true);
        navigate("/bets-history");
      } catch (error) {
        console.error("Failed to accept bet:", error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        alert(`Failed to accept bet: ${errorMessage}`);
      }
    },
    [user, navigate]
  );

  const handleViewTickets = useCallback(() => {
    navigate("/bets-history");
  }, [navigate]);

  // Render bet proposal message
  if (message.type === "bet_proposal") {
    const betMsg = message as BetProposalMessage;
    return (
      <div
        className={`message bet-proposal-message ${
          isOwnMessage ? "own-message" : "other-message"
        }`}
      >
        <div className="bet-proposal-content bet-proposal-flex">
          <div className="bet-proposal-info">
            <div className="wager-amount">
              Wager: ${Number(betMsg.betDetails.wager_amount).toFixed(2)}
            </div>

            <div className="game-context">
              {betMsg.betDetails.entity1_name} vs.{" "}
              {betMsg.betDetails.entity2_name}
            </div>
          </div>
          <div className="bet-actions bet-actions-flex-end">
            {accepted ? (
              <button className="accept-bet" onClick={handleViewTickets}>
                View Tickets
              </button>
            ) : (
              <div>
                <button
                  className="accept-bet"
                  onClick={() => handleAccept(betMsg)}
                  disabled={settled}
                >
                  &nbsp;&nbsp;&nbsp;Accept&nbsp;&nbsp;&nbsp;
                </button>
                <div className="bet-timer">
                  {settled
                    ? "Pending"
                    : timeLeft !== null
                    ? `${timeLeft.toFixed(1)}s`
                    : "--"}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="bet-details bet-details-full">
          {betMsg.betDetails.entity1_name}{" "}
          {betMsg.betDetails.entity1_proposition} <b>___</b>{" "}
          {betMsg.betDetails.entity2_name}{" "}
          {betMsg.betDetails.entity2_proposition}
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
