import React, { useState, useMemo, useCallback } from "react";
import { useAuth } from "@features/auth";
import { useAuthProfile, useFriends } from "@features/social/hooks";
import { SearchBar } from "@shared/widgets/SearchBar/SearchBar";
import { UserList, type UserItem, type UserActionProps } from "@components/Social/UserList/UserList";
import { XIcon } from "@shared/widgets/icons/XIcon";
import "./FriendsManager.css";
import { useDialog } from "@shared/hooks/useDialog";
import { HttpError } from "@data/clients/restClient";

const FRIEND_RATE_LIMIT_TITLE = "Add Friend";
const FRIEND_RATE_LIMIT_MESSAGE = "You've already added 10 friends in the last minute. Take a quick breather before adding more.";
const FRIEND_PENDING_MESSAGE = "A friend request is already pending with this user.";

const isRateLimited = (error: unknown): error is HttpError => error instanceof HttpError && error.status === 429;

interface RemoveFriendActionProps extends UserActionProps {
  onRemove: (user: UserItem) => void;
}

const RemoveFriendAction: React.FC<RemoveFriendActionProps> = ({ user, disabled, onRemove }) => {
  const handleActivate = () => {
    if (disabled) return;
    onRemove(user);
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
      className="user-action-icon remove"
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={handleActivate}
      onKeyDown={onKeyDown}
      aria-label={`Remove ${user.username}`}
      aria-disabled={disabled || undefined}
    >
      <XIcon />
    </span>
  );
};

export const FriendsManager: React.FC = () => {
  const { user } = useAuth();
  const { profile } = useAuthProfile();
  const { friends, loading, add, remove } = useFriends(profile?.user_id || undefined);
  const [friendUsernameToAdd, setFriendUsernameToAdd] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const { showAlert, showConfirm, dialogNode } = useDialog();

  const filteredFriends: UserItem[] = useMemo(
    () => friends
      .filter((f) => f.username.toLowerCase().includes(searchTerm.toLowerCase()))
      .map((f) => ({ id: f.user_id, username: f.username })),
    [friends, searchTerm]
  );

  const handleRemoveFriend = useCallback(async (friend: UserItem) => {
    if (!profile?.user_id) return;
    const confirmed = await showConfirm({
      title: "Remove Friend",
      message: `Are you sure you want to remove ${friend.username} as a friend?`,
      confirmLabel: "Remove",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await remove(friend.id);
      await showAlert({ title: "Remove Friend", message: `${friend.username} removed from friends.` });
    } catch {
      await showAlert({ title: "Remove Friend", message: "An unexpected error occurred while removing friend." });
    } finally {
      setBusy(false);
    }
  }, [profile?.user_id, remove, showConfirm, showAlert]);

  const ActionComponent = useCallback(
    (props: UserActionProps) => <RemoveFriendAction {...props} onRemove={handleRemoveFriend} />,
    [handleRemoveFriend]
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

  return (
    <>
      <section className="friends-manager-container">
        <form onSubmit={handleAddFriend} className="add-friend-form">
          <SearchBar
            value={friendUsernameToAdd}
            onChange={(v: string) =>
              setFriendUsernameToAdd(v.replace(/[^a-zA-Z0-9_]/g, ""))
            }
            placeholder="Add friend"
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
        <div className="friends-search-bar">
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
        <UserList
          users={filteredFriends}
          ActionComponent={ActionComponent}
          onRowClick={handleRemoveFriend}
          loading={loading}
          loadingMessage="Loading friends..."
          emptyMessage="No friends yet. Add by entering their username!"
          disabled={busy}
        />
      </section>
      {dialogNode}
    </>
  );
};
export default FriendsManager;
