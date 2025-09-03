import { useState } from "react";
import { TextMessage } from "../TextMessage/TextMessage";
import "./ChatArea.css";
import { formatTimeOfDay } from "@shared/utils/dateTime";
import type { ChatMessage } from "@shared/types/chat";
import { useGroupedMessages } from "@features/tables/chat/useGroupedMessages";
import { useAutoScroll } from "@features/tables/chat/useAutoScroll";

interface ChatAreaProps {
  messages: ChatMessage[];
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
  const bottomRef = useAutoScroll([messages.length]);
  const grouped = useGroupedMessages(messages);

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    onSendMessage(newMessage.trim());
    setNewMessage("");
  // input focus intentionally omitted after refactor (could add ref back if needed)
  };

  return (
    <div className="chat-container">
      <div className="messages-container">
        {grouped.map(group => (
          <div key={group.dateLabel} className="message-group">
            <div className="date-divider"><span>{group.dateLabel}</span></div>
            {group.messages.map(message => (
              <TextMessage
                key={message.id}
                message={message}
                isOwnMessage={message.senderUserId === currentUserId}
                formatTimestamp={(timestamp: string) => formatTimeOfDay(timestamp) || "N/A"}
              />
            ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="message-input-container">
  <input
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
