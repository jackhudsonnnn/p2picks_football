import React, { useState, useMemo } from "react";
import { useAuth } from "@features/auth";
import { useAuthProfile, useFriends } from "@features/social/hooks";
import { SearchBar } from "@shared/widgets/SearchBar/SearchBar";
import { FriendsList } from "@components/Social/FriendsList/FriendsList";
import "./FriendsManager.css";
import { useDialog } from "@shared/hooks/useDialog";
import { HttpError } from "@data/clients/restClient";

const FRIEND_RATE_LIMIT_TITLE = "Add Friend";
const FRIEND_RATE_LIMIT_MESSAGE = "You've already added 10 friends in the last minute. Take a quick breather before adding more.";
const FRIEND_PENDING_MESSAGE = "A friend request is already pending with this user.";

const isRateLimited = (error: unknown): error is HttpError => error instanceof HttpError && error.status === 429;

export const FriendsManager: React.FC = () => {
  const { user } = useAuth();
  const { profile } = useAuthProfile();
  const { friends, loading, add, remove } = useFriends(profile?.user_id || undefined);
  const [friendUsernameToAdd, setFriendUsernameToAdd] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const { showAlert, showConfirm, dialogNode } = useDialog();
  const filteredFriends = useMemo(
    () => friends.filter((f) => f.username.toLowerCase().includes(searchTerm.toLowerCase())),
    [friends, searchTerm]
  );
  if (!user || !profile) return null;
  if (!profile.username) return null;
  const isFriendUsernameValid = friendUsernameToAdd.trim().length > 0;
  const handleAddFriend: React.FormEventHandler = async (e) => {
    e.preventDefault();
    if (!profile.user_id || !friendUsernameToAdd.trim()) return;
    const targetUsername = friendUsernameToAdd.trim();
    if (targetUsername === profile.username) {
      await showAlert({ title: "Add Friend", message: "You cannot add yourself as a friend." });
      return;
    }
    if (friends.some((f) => f.username === targetUsername)) {
      await showAlert({
        title: "Add Friend",
        message: `${targetUsername} is already in your friends list.`,
      });
      setFriendUsernameToAdd("");
      return;
    }
    setBusy(true);
    try {
      const result = await add(targetUsername);
      setFriendUsernameToAdd("");
      if (result?.status === "accepted") {
        await showAlert({ title: "Add Friend", message: `${targetUsername} added as a friend!` });
      } else {
        await showAlert({ title: "Friend Request Sent", message: `Friend request sent to ${targetUsername}.` });
      }
    } catch (err) {
      if (isRateLimited(err)) {
        await showAlert({ title: FRIEND_RATE_LIMIT_TITLE, message: FRIEND_RATE_LIMIT_MESSAGE });
      } else if (err instanceof HttpError && err.status === 409) {
        await showAlert({ title: "Add Friend", message: FRIEND_PENDING_MESSAGE });
      } else {
        await showAlert({ title: "Add Friend", message: "An unexpected error occurred while adding friend." });
      }
    } finally {
      setBusy(false);
    }
  };
  const handleRemoveFriend = async (friend: { user_id: string; username: string }) => {
    if (!profile.user_id) return;
    const confirmed = await showConfirm({
      title: "Remove Friend",
      message: `Are you sure you want to remove ${friend.username} as a friend?`,
      confirmLabel: "Remove",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await remove(friend.user_id);
      await showAlert({ title: "Remove Friend", message: `${friend.username} removed from friends.` });
    } catch {
      await showAlert({ title: "Remove Friend", message: "An unexpected error occurred while removing friend." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="profile-section">
        <form onSubmit={handleAddFriend} className="add-friend-form">
          <SearchBar
            value={friendUsernameToAdd}
            onChange={(v: string) =>
              setFriendUsernameToAdd(v.replace(/[^a-zA-Z0-9_]/g, ""))
            }
            placeholder="Enter username"
            inputClassName="profile-input"
            ariaLabel="Friend username input"
            className="add-friend-search"
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={!isFriendUsernameValid || busy || loading}
          >
            {busy ? "Adding..." : "Add"}
          </button>
        </form>
        <div style={{ marginTop: "1rem" }}>
          <SearchBar
            value={searchTerm}
            onChange={(v: string) =>
              setSearchTerm(v.replace(/[^a-zA-Z0-9_]/g, ""))
            }
            placeholder="Search friends"
            inputClassName="profile-input"
            ariaLabel="Search friends"
            className="account-search"
          />
        </div>
        {loading ? (
          <FriendsList
            friends={[]}
            emptyMessage="Loading friends..."
            mode="select"
            variant="remove"
            disabled={busy}
          />
        ) : (
          <FriendsList
            friends={filteredFriends}
            emptyMessage="No friends yet. Add some friends using their username!"
            mode="select"
            variant="remove"
            onAction={(userId: string) => {
              const friend = filteredFriends.find(f => f.user_id === userId);
              if (friend) {
                void handleRemoveFriend(friend);
              }
            }}
            disabled={busy}
          />
        )}
      </section>
      {dialogNode}
    </>
  );
};
export default FriendsManager;
