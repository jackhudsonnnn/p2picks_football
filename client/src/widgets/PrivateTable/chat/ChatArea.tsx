import { useState, useRef, useEffect } from 'react';
import TextMessage, { Message } from './TextMessage';
import './ChatArea.css';

interface ChatAreaProps {
  messages: Message[];
  currentUserId: string;
  onSendMessage: (message: string) => void;
  onProposeBet: () => void;
}

const ChatArea: React.FC<ChatAreaProps> = ({ 
  messages, 
  currentUserId, 
  onSendMessage, 
  onProposeBet 
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

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  const groupedMessages = messages.reduce<{ [date: string]: Message[] }>(
    (groups, message) => {
      const dateStr = new Date(message.timestamp).toDateString();
      if (!groups[dateStr]) { groups[dateStr] = []; }
      groups[dateStr].push(message);
      return groups;
    },
    {}
  );

  return (
    <div className="chat-container">
      <div className="messages-container">
        {Object.entries(groupedMessages).map(([date, msgs]) => (
          <div key={date} className="message-group">
            <div className="date-divider">
              <span>{formatDate(msgs[0].timestamp)}</span>
            </div>

            {msgs.map((message) => (
              <TextMessage 
                key={message.id}
                message={message}
                isOwnMessage={message.senderUserId === currentUserId}
                formatTimestamp={formatTimestamp}
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
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
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

export default ChatArea;
