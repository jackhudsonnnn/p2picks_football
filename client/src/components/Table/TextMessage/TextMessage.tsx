import React from "react";
import "./TextMessage.css";
import { BetProposalMessage } from "@shared/types/chat";
import BetProposalCard from "@components/Bet/BetProposalCard/BetProposalCard";

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

export const TextMessage: React.FC<TextMessageProps> = ({ message, isOwnMessage, formatTimestamp }) => {
  if (message.type === "bet_proposal") {
    const betMsg = message as BetProposalMessage;
    // Render only the system-style card (details come as separate chat message now)
    return <BetProposalCard message={betMsg} isOwnMessage={false} />; // system style always centered
  }

  return (
    <div className={`message ${message.type} ${isOwnMessage ? "own-message" : "other-message"}`}>
      {message.type === "system" ? (
        <div className="system-message">{message.text}</div>
      ) : (
        <div className="chat-message">
          <div className="message-header">
            <span className="sender-name">{message.senderUsername}</span>
            <span className="message-time">{formatTimestamp(message.timestamp)}</span>
          </div>
          <p className="message-text" style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p>
        </div>
      )}
    </div>
  );
};