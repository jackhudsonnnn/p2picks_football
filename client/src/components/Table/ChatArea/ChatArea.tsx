import { useCallback, useRef, useState } from "react";
import { TextMessage } from "../TextMessage/TextMessage";
import "./ChatArea.css";
import { formatTimeOfDay } from "@shared/utils/dateTime";
import type { ChatMessage } from "@shared/types/chat";
import { useGroupedMessages } from "@features/table/chat/useGroupedMessages";
import { useAutoScroll } from "@features/table/chat/useAutoScroll";
import { LoadMoreButton } from "@shared/widgets";

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
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
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
  }, [isSending, newMessage, onSendMessage]);

  const handleLoadMore = useCallback(async () => {
    if (!onLoadMore) return;

    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const prevScrollTop = container?.scrollTop ?? 0;

    await onLoadMore();

    // After new messages render, preserve viewport position so it doesn't jump to top
    requestAnimationFrame(() => {
      const next = messagesContainerRef.current;
      if (!next) return;
      const delta = next.scrollHeight - prevScrollHeight;
      next.scrollTop = prevScrollTop + delta;
    });
  }, [onLoadMore]);

  return (
    <div className="chat-container">
      <div className="messages-container" ref={messagesContainerRef}>
        {hasMore && (
          <LoadMoreButton
            label="Load older messages"
            loadingLabel="Loading…"
            loading={loadingMore}
            disabled={loadingMore}
            onClick={handleLoadMore}
          />
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
