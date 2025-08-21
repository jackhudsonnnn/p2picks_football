// client/src/pages/AccountPage.tsx

import React, { useState } from "react";
import "./AccountPage.css";
import { useAuth } from "@features/auth";
import { useAuthProfile, useFriends, useUsernameUpdater } from "@features/social/hooks";
import SearchBar from "@shared/ui/SearchBar/SearchBar";

export const AccountPage: React.FC = () => {
  const { user } = useAuth();
  const { profile: userProfile, loading: loadingProfile } = useAuthProfile();
  const [newUsername, setNewUsername] = useState("");
  const [showUsernameForm, setShowUsernameForm] = useState(false);
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const { friends, loading: loadingFriends, add, remove } = useFriends(userProfile?.user_id || undefined);
  const [friendUsernameToAdd, setFriendUsernameToAdd] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const { update } = useUsernameUpdater(user?.id);

  // Handle Username Update
  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userProfile) return;
    setIsUpdatingUsername(true);
    try {
      const data = await update(newUsername);
      if (data) {
        setNewUsername("");
        setShowUsernameForm(false);
        alert("Username updated successfully!");
      }
    } catch (err) {
      alert("An unexpected error occurred.");
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  // Handle Add Friend
  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
  if (!userProfile?.user_id || !friendUsernameToAdd.trim()) return;

    const targetUsername = friendUsernameToAdd.trim();

    if (targetUsername === userProfile.username) {
      alert("You cannot add yourself as a friend.");
      return;
    }

    // Check if already friends
    if (friends.some((friend) => friend.username === targetUsername)) {
      alert(`${targetUsername} is already in your friends list.`);
      setFriendUsernameToAdd("");
      return;
    }

  setIsUpdatingUsername(true); // Re-use for loading state, or create a new one
    try {
    await add(targetUsername);
    setFriendUsernameToAdd("");
    alert(`${targetUsername} added as a friend!`);
    } catch (err) {
      alert("An unexpected error occurred while adding friend.");
    } finally {
      setIsUpdatingUsername(false); // Or the new loading state for adding friend
    }
  };

  // Handle Remove Friend
  const handleRemoveFriend = async (friendToRemove: { user_id: string; username: string }) => {
    if (!userProfile?.user_id) return;

    const confirmRemoval = window.confirm(
      `Are you sure you want to remove ${friendToRemove.username} as a friend?`
    );
    if (!confirmRemoval) return;

    setIsUpdatingUsername(true); // Re-use for loading state
    try {
    await remove(friendToRemove.user_id);
    alert(`${friendToRemove.username} removed from friends.`);
    } catch (err) {
      alert("An unexpected error occurred while removing friend.");
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  const filteredFriends = friends.filter((friend) =>
    friend.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loadingProfile) {
    return <div className="container">Loading user profile...</div>;
  }

  if (!user || !userProfile) {
    return <div className="container">Please log in to view your account.</div>; // Or a login link
  }

  const isUsernameValid =
    newUsername.trim().length >= 3 &&
    newUsername.trim().length <= 15 &&
    /^[a-zA-Z0-9_]+$/.test(newUsername.trim());
  const isUsernameEmpty = newUsername.trim() === "";
  const showUsernameInvalidStyle = !isUsernameEmpty && !isUsernameValid;

  // Friend username input validation (simple check for non-empty)
  const isFriendUsernameValid = friendUsernameToAdd.trim().length > 0;

  return (
    <div className="container account-page">
      <div className="profile-container container-primary">
        <section className="profile-section">
          <h2>Profile</h2>
          <div className="username-section">
            <div className="current-username">
              <h3>Username</h3>
              <p>
                {userProfile.username
                  ? `Hello, ${userProfile.username}!`
                  : "No username set. Please create one."}
              </p>
              {!showUsernameForm && userProfile.username && (
                <button
                  className="btn-primary change-username-btn"
                  onClick={() => {
                    setNewUsername(userProfile.username || "");
                    setShowUsernameForm(true);
                  }}
                  disabled={isUpdatingUsername}
                >
                  Change Username
                </button>
              )}
            </div>

            {showUsernameForm && (
              <form onSubmit={handleUsernameSubmit} className="username-form">
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder={
                    userProfile.username
                      ? "Enter new username"
                      : "Create a  Username"
                  }
                  className={`profile-input ${
                    showUsernameInvalidStyle ? "profile-input-invalid" : ""
                  }`}
                  disabled={isUpdatingUsername}
                  maxLength={15}
                />
                {showUsernameInvalidStyle && (
                  <small style={{ color: "var(--accent-power)" }}>
                    3-15 chars, A-Z, 0-9, _
                  </small>
                )}
                <div className="form-buttons">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={
                      isUpdatingUsername ||
                      (!isUsernameValid && !isUsernameEmpty)
                    }
                  >
                    {isUpdatingUsername ? "Saving..." : "Save"}
                  </button>
                  {userProfile.username && ( // Only show cancel if a username already exists
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setShowUsernameForm(false);
                        setNewUsername("");
                      }}
                      disabled={isUpdatingUsername}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </section>

        {userProfile.username && ( // Only show friends section if user has a username
          <section className="profile-section">
            <h3>Friends</h3>
            <form onSubmit={handleAddFriend} className="add-friend-form">
              <SearchBar
                value={friendUsernameToAdd}
                onChange={(v: string) => setFriendUsernameToAdd(v.replace(/[^a-zA-Z0-9_]/g, ""))}
                placeholder="Enter friend's username"
                inputClassName="profile-input"
                ariaLabel="Friend username input"
                className="add-friend-search"
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={
                  !isFriendUsernameValid || isUpdatingUsername || loadingFriends
                }
              >
                {isUpdatingUsername ? "Adding..." : "Add Friend"}
              </button>
            </form>

            <div style={{ marginTop: "1rem" }}>
              <SearchBar
                value={searchTerm}
                onChange={(v: string) => setSearchTerm(v.replace(/[^a-zA-Z0-9_]/g, ""))}
                placeholder="Search friends"
                inputClassName="profile-input"
                ariaLabel="Search friends"
                className="account-search"
              />
            </div>

            {loadingFriends ? (
              <p>Loading friends...</p>
            ) : (
              <div className="friends-list">
                {filteredFriends.length > 0 ? (
                  filteredFriends.map((friend) => (
                    <div
                      key={friend.user_id} 
                      className="friend-item container-primary"
                    >
                      <div className="friend-info">
                        <img
                          src={`https://ui-avatars.com/api/?name=${friend.username}&background=random`}
                          alt={`${friend.username}'s avatar`}
                          className="friend-avatar"
                        />
                        <div>
                          <span className="friend-username">
                            {friend.username}
                          </span>
                        </div>
                      </div>
                      <button
                        className="btn-danger"
                        onClick={() => handleRemoveFriend(friend)}
                        aria-label="Remove friend"
                        disabled={isUpdatingUsername}
                      >
                        ✖
                      </button>
                    </div>
                  ))
                ) : (
                  <p>No friends yet. Add some friends using their username!</p>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};
