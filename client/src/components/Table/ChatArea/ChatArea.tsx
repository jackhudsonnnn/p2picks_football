import { useCallback, useState } from "react";
import { TextMessage } from "../TextMessage/TextMessage";
import "./ChatArea.css";
import { formatTimeOfDay } from "@shared/utils/dateTime";
import type { ChatMessage } from "@shared/types/chat";
import { useGroupedMessages } from "@features/tables/chat/useGroupedMessages";
import { useAutoScroll } from "@features/tables/chat/useAutoScroll";

interface ChatAreaProps {
  messages: ChatMessage[];
  currentUserId: string;
  onSendMessage: (message: string) => Promise<void> | void;
  onProposeBet: () => void;
  onLoadMore?: () => Promise<void> | void;
  hasMore?: boolean;
  loading?: boolean;
  loadingMore?: boolean;
  tableName?: string;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  currentUserId,
  onSendMessage,
  onProposeBet,
  onLoadMore,
  hasMore = false,
  loading = false,
  loadingMore = false,
  tableName = "",
}) => {
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const newestMessageId = messages.length ? messages[messages.length - 1]?.id : undefined;
  const bottomRef = useAutoScroll([newestMessageId]);
  const grouped = useGroupedMessages(messages);

  const handleSendMessage = useCallback(async () => {
    const trimmed = newMessage.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    try {
      await onSendMessage(trimmed);
      setNewMessage("");
    } catch (err) {
      console.error("[ChatArea] Failed to send message", err);
    } finally {
      setIsSending(false);
    }
    // input focus intentionally omitted after refactor (could add ref back if needed)
  }, [isSending, newMessage, onSendMessage]);

  return (
    <div className="chat-container">
      <div className="messages-container">
        {hasMore && (
          <div className="load-more-container">
            <button
              className="load-more-button"
              onClick={() => { if (onLoadMore) void onLoadMore(); }}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}

        {loading && !messages.length ? (
          <div className="messages-empty" role="status">Loading messages…</div>
        ) : grouped.length ? (
          grouped.map(group => (
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
          ))
        ) : (
          <div className="messages-empty" role="status">No messages yet. Start the conversation!</div>
        )}
        {loading && messages.length > 0 && (
          <div className="messages-status" role="status">Refreshing…</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="message-input-container">
        <input
          type="text"
          placeholder={`Type a message for ${tableName || "this table"}...`}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSendMessage();
            }
          }}
          className="message-input"
        />
        <div className="action-buttons-row">
          <button
            className="send-button"
            onClick={() => { void handleSendMessage(); }}
            disabled={!newMessage.trim() || isSending}
          >
            {isSending ? "Sending…" : "Send"}
          </button>
          <button className="place-bet-button" onClick={onProposeBet}>
            Propose Bet
          </button>
        </div>
      </div>
    </div>
  );
};
