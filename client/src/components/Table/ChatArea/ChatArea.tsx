import { useState, useRef, useEffect } from "react";
import { TextMessage, Message } from "../TextMessage/TextMessage";
import "./ChatArea.css";
import { formatTimeOfDay, groupByDateLabel } from "@shared/utils/dateTime";

interface ChatAreaProps {
  messages: Message[];
  currentUserId: string;
  onSendMessage: (message: string) => void;
  onProposeBet: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  currentUserId,
  onSendMessage,
  onProposeBet,
}) => {
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    onSendMessage(newMessage.trim());
    setNewMessage("");
    messageInputRef.current?.focus();
  };

  return (
    <div className="chat-container">
      <div className="messages-container">
        {Object.entries(
          groupByDateLabel(
            messages.map((m) => ({ ...m, timestamp: m.timestamp }))
          )
        ).map(([label, msgs]) => (
          <div key={label} className="message-group">
            <div className="date-divider">
              <span>{label}</span>
            </div>

            {msgs.map((message) => (
              <TextMessage
                key={message.id}
                message={message}
                isOwnMessage={message.senderUserId === currentUserId}
                formatTimestamp={(timestamp: string) =>
                  formatTimeOfDay(timestamp) || "N/A"
                }
              />
            ))}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="message-input-container">
        <input
          ref={messageInputRef}
          type="text"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
          className="message-input"
        />
        <div className="action-buttons-row">
          <button
            className="send-button"
            onClick={handleSendMessage}
            disabled={!newMessage.trim()}
          >
            Send
          </button>
          <button className="place-bet-button" onClick={onProposeBet}>
            Propose Bet
          </button>
        </div>
      </div>
    </div>
  );
};
