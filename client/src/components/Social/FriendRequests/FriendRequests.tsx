import React, { useMemo, useState } from "react";
import { useAuth } from "@features/auth";
import { useAuthProfile, useFriendRequests, useFriends } from "@features/social/hooks";
import SearchBar from "@shared/widgets/SearchBar/SearchBar";
import { FriendsList } from "@shared/widgets";
import { useDialog } from "@shared/hooks/useDialog";
import "./FriendRequests.css";

type RequestAction = "accept" | "decline" | "cancel";

export const FriendRequests: React.FC = () => {
  const { user } = useAuth();
  const { profile } = useAuthProfile();
  const { refresh: refreshFriends } = useFriends(profile?.user_id || undefined);
  const { requests, loading, respond } = useFriendRequests(profile?.user_id);
  const [searchTerm, setSearchTerm] = useState("");
  const [busyRequest, setBusyRequest] = useState<string | null>(null);
  const { showConfirm, dialogNode } = useDialog();

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return requests
      .filter((r) => r.receiver_user_id === profile?.user_id) // incoming only
      .filter((r) => r.status === "pending")
      .map((r) => ({
        ...r,
        otherUser: r.sender,
      }))
      .filter((r) => (r.otherUser.username ?? "").toLowerCase().includes(term));
  }, [requests, profile?.user_id, searchTerm]);

  if (!user || !profile) return null;

  const handleAction = async (requestId: string, action: RequestAction) => {
    setBusyRequest(requestId);
    try {
      const { status } = await respond(requestId, action);
      if (status === "accepted") {
        await refreshFriends();
      }
    } finally {
      setBusyRequest(null);
    }
  };

  const handleRequestClick = async (requestId: string, username: string) => {
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
  };

  return (
    <section className="profile-section">
      <h3>Friend Requests</h3>
      <div style={{ marginTop: "1rem" }}>
        <SearchBar
          value={searchTerm}
          onChange={(v: string) => setSearchTerm(v.replace(/[^a-zA-Z0-9_]/g, ""))}
          placeholder="Search requests"
          inputClassName="profile-input"
          ariaLabel="Search friend requests"
          className="account-search"
        />
      </div>

      {loading ? (
        <FriendsList
        mode="select"
        friends={[]}
        emptyMessage="No friend requests right now."
        />
      ) : (
        <FriendsList
        mode="select"
        friends={filtered.map((r) => ({ user_id: r.request_id, username: r.otherUser.username ?? "Unknown" }))}
        onAction={(requestId, username) => void handleRequestClick(requestId, username)}
        variant="add"
        hideActionSymbol
        disabled={busyRequest !== null}
        emptyMessage="No friend requests right now."
        />
      )}
      {dialogNode}
    </section>
  );
};

export default FriendRequests;