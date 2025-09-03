import React, { useState, useMemo } from "react";
import { useAuth } from "@features/auth";
import { useAuthProfile, useFriends } from "@features/social/hooks";
import SearchBar from "@shared/widgets/SearchBar/SearchBar";
import { FriendsList } from "@shared/widgets/index";
import "./FriendsManager.css";

export const FriendsManager: React.FC = () => {
  const { user } = useAuth();
  const { profile } = useAuthProfile();
  const { friends, loading, add, remove } = useFriends(profile?.user_id || undefined);
  const [friendUsernameToAdd, setFriendUsernameToAdd] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [busy, setBusy] = useState(false);
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
      alert("You cannot add yourself as a friend.");
      return;
    }
    if (friends.some((f) => f.username === targetUsername)) {
      alert(`${targetUsername} is already in your friends list.`);
      setFriendUsernameToAdd("");
      return;
    }
    setBusy(true);
    try {
      await add(targetUsername);
      setFriendUsernameToAdd("");
      alert(`${targetUsername} added as a friend!`);
    } catch {
      alert("An unexpected error occurred while adding friend.");
    } finally {
      setBusy(false);
    }
  };
  const handleRemoveFriend = async (friend: { user_id: string; username: string }) => {
    if (!profile.user_id) return;
    if (!window.confirm(`Are you sure you want to remove ${friend.username} as a friend?`)) return;
    setBusy(true);
    try {
      await remove(friend.user_id);
      alert(`${friend.username} removed from friends.`);
    } catch {
      alert("An unexpected error occurred while removing friend.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="profile-section">
      <h3>Friends</h3>
      <form onSubmit={handleAddFriend} className="add-friend-form">
        <SearchBar
          value={friendUsernameToAdd}
          onChange={(v: string) =>
            setFriendUsernameToAdd(v.replace(/[^a-zA-Z0-9_]/g, ""))
          }
          placeholder="Enter friend's username"
          inputClassName="profile-input"
          ariaLabel="Friend username input"
          className="add-friend-search"
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={!isFriendUsernameValid || busy || loading}
        >
          {busy ? "Adding..." : "Add Friend"}
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
        <p>Loading friends...</p>
      ) : (
        <FriendsList
          friends={filteredFriends}
          emptyMessage="No friends yet. Add some friends using their username!"
          mode="select"
          variant="remove"
          onAction={(userId: string) => {
            const friend = filteredFriends.find(f => f.user_id === userId);
            if (friend) handleRemoveFriend(friend);
          }}
          disabled={busy}
          removeSymbol="✖"
        />
      )}
    </section>
  );
};
export default FriendsManager;
