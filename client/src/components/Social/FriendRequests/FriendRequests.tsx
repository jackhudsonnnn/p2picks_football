import React, { useMemo, useDeferredValue, useState, useCallback } from "react";
import { useAuth } from "@features/auth";
import { useAuthProfile, useFriendRequests, useFriends } from "@features/social/hooks";
import { SearchBar } from "@shared/widgets/SearchBar/SearchBar";
import { UserList, type UserItem, type UserActionProps } from "@components/Social/UserList/UserList";
import { useDialog } from "@shared/hooks/useDialog";
import CheckIcon from "@shared/widgets/icons/CheckIcon";
import "./FriendRequests.css";

type RequestAction = "accept" | "decline" | "cancel";

interface RequestActionComponentProps extends UserActionProps {
  onAction: (requestId: string, username: string) => void;
}

const RequestActionIcon: React.FC<RequestActionComponentProps> = ({ user, disabled, onAction }) => {
  const handleActivate = () => {
    if (disabled) return;
    onAction(user.id, user.username);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleActivate();
    }
  };

  return (
    <span
      className="user-action-icon request"
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={handleActivate}
      onKeyDown={onKeyDown}
      aria-label={`Respond to request from ${user.username}`}
      aria-disabled={disabled || undefined}
    >
      <CheckIcon className={disabled ? "icon-disabled" : ""} title={`Respond to ${user.username}`} />
    </span>
  );
};

export const FriendRequests: React.FC = () => {
  const { user } = useAuth();
  const { profile } = useAuthProfile();
  const { refresh: refreshFriends } = useFriends(profile?.user_id || undefined);
  const { requests, loading, respond } = useFriendRequests(profile?.user_id);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearch = useDeferredValue(searchTerm);
  const [busyRequest, setBusyRequest] = useState<string | null>(null);
  const { showConfirm, dialogNode } = useDialog();

  const filtered: UserItem[] = useMemo(() => {
    const term = deferredSearch.toLowerCase();
    return requests
      .filter((r) => r.receiver_user_id === profile?.user_id) // incoming only
      .filter((r) => r.status === "pending")
      .map((r) => ({
        id: r.request_id,
        username: r.sender.username ?? "Unknown",
      }))
      .filter((r) => r.username.toLowerCase().includes(term));
  }, [requests, profile?.user_id, deferredSearch]);

  const handleAction = useCallback(async (requestId: string, action: RequestAction) => {
    setBusyRequest(requestId);
    try {
      const { status } = await respond(requestId, action);
      if (status === "accepted") {
        await refreshFriends();
      }
    } finally {
      setBusyRequest(null);
    }
  }, [respond, refreshFriends]);

  const handleRequestClick = useCallback(async (requestId: string, username: string) => {
    const accept = await showConfirm({
      title: "Friend Request",
      message: `Accept friend request from ${username}?`,
      confirmLabel: "Accept",
      cancelLabel: "Deny",
    });
    if (accept) {
      await handleAction(requestId, "accept");
    } else {
      await handleAction(requestId, "decline");
    }
  }, [showConfirm, handleAction]);

  const ActionComponent = useCallback(
    (props: UserActionProps) => <RequestActionIcon {...props} onAction={handleRequestClick} />,
    [handleRequestClick]
  );

  if (!user || !profile) return null;

  return (
    <section className="friends-requests-container">
      <div>
        <SearchBar
          value={searchTerm}
          onChange={(v: string) => setSearchTerm(v.replace(/[^a-zA-Z0-9_]/g, ""))}
          placeholder="Search requests"
          inputClassName="friend-requests-input"
          ariaLabel="Search friend requests"
          className="account-search"
        />
      </div>

      <UserList
        users={filtered}
        ActionComponent={ActionComponent}
        onRowClick={(user) => void handleRequestClick(user.id, user.username)}
        loading={loading}
        loadingMessage="Loading requests..."
        emptyMessage="No friend requests right now."
        disabled={busyRequest !== null}
      />
      {dialogNode}
    </section>
  );
};

export default FriendRequests;