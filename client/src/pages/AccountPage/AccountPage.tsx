// client/src/pages/AccountPage.tsx

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../shared/api/supabaseClient"; // Ensure this path is correct
import type { User } from "@supabase/supabase-js";
import "./AccountPage.css";

// Define types for profile and friend
interface UserProfile {
  user_id: string;
  username: string | null;
  email?: string; // Optional: if you want to store/display it
}

interface Friend {
  user_id: string; // This will be the friend's user_id
  username: string;
  // Add other relevant friend details if needed, e.g., email
}

export const AccountPage: React.FC = () => {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [newUsername, setNewUsername] = useState("");
  const [showUsernameForm, setShowUsernameForm] = useState(false);
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [friendUsernameToAdd, setFriendUsernameToAdd] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch current authenticated user and their profile
  const fetchUserAndProfile = useCallback(async () => {
    setLoadingProfile(true);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("Error fetching auth user:", authError);
      setLoadingProfile(false);
      return;
    }

    if (user) {
      setAuthUser(user);
      const { data: profileData, error: profileError } = await supabase
        .from("users")
        .select("user_id, username, email")
        .eq("user_id", user.id)
        .single();

      if (profileError) {
        console.error("Error fetching user profile:", profileError);
        // Potentially handle case where profile doesn't exist yet for a new auth user
        // For now, we assume a profile row is created (e.g., via trigger)
        setUserProfile({ user_id: user.id, username: null, email: user.email });
      } else if (profileData) {
        setUserProfile(profileData as UserProfile);
        if (profileData.username) {
          setShowUsernameForm(false); // Don't show form if username exists
        } else {
          setShowUsernameForm(true); // Show form if no username
        }
      }
    } else {
      // No user logged in, potentially redirect or show login message
      console.log("No authenticated user found.");
    }
    setLoadingProfile(false);
  }, []);

  useEffect(() => {
    fetchUserAndProfile();
  }, [fetchUserAndProfile]);

  // Fetch friends list
  const fetchFriends = useCallback(async () => {
    if (!userProfile?.user_id) return;

    setLoadingFriends(true);
    const currentUserId = userProfile.user_id;

    // Step 1: Get all friend relationships
    const { data: friendRelations, error: relationsError } = await supabase
      .from("friends")
      .select("user_id1, user_id2")
      .or(`user_id1.eq.${currentUserId},user_id2.eq.${currentUserId}`);

    if (relationsError) {
      console.error("Error fetching friend relations:", relationsError);
      setLoadingFriends(false);
      return;
    }

    if (friendRelations && friendRelations.length > 0) {
      // Step 2: Extract friend IDs
      const friendUserIds = friendRelations
        .map((rel) =>
          rel.user_id1 === currentUserId ? rel.user_id2 : rel.user_id1
        )
        .filter((id) => id !== currentUserId); // Ensure not to add self if somehow present

      if (friendUserIds.length === 0) {
        setFriends([]);
        setLoadingFriends(false);
        return;
      }

      // Step 3: Fetch profiles for these friend IDs
      const { data: friendProfiles, error: profilesError } = await supabase
        .from("users")
        .select("user_id, username")
        .in("user_id", friendUserIds);

      if (profilesError) {
        console.error("Error fetching friend profiles:", profilesError);
      } else if (friendProfiles) {
        setFriends(
          friendProfiles.filter((fp) => fp.username !== null) as Friend[]
        );
      }
    } else {
      setFriends([]);
    }
    setLoadingFriends(false);
  }, [userProfile?.user_id]);

  useEffect(() => {
    if (userProfile?.user_id && userProfile.username) {
      // Only fetch friends if user has a profile and username
      fetchFriends();
    }
  }, [userProfile, fetchFriends]);

  // Handle Username Update
  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser || !userProfile) return;

    const formattedUsername = newUsername.replace(/[^a-zA-Z0-9_]/g, "");
    if (formattedUsername.length < 3 || formattedUsername.length > 15) {
      alert(
        "Username must be 3-15 characters long and contain only letters, numbers, and underscores."
      );
      return;
    }

    setIsUpdatingUsername(true);
    try {
      // Check if username already exists
      const { data: existingUser, error: fetchError } = await supabase
        .from("users")
        .select("username")
        .eq("username", formattedUsername)
        .neq("user_id", authUser.id) // Don't match against the current user themselves if they are just re-saving same name
        .single();

      if (fetchError && fetchError.code !== "PGRST116") {
        // PGRST116: "single" query did not return exactly one row (expected for no match)
        console.error("Error checking username existence:", fetchError);
        alert("Error checking username. Please try again.");
        setIsUpdatingUsername(false);
        return;
      }

      if (existingUser) {
        alert("Username already taken. Please choose another one.");
        setIsUpdatingUsername(false);
        return;
      }

      // Update username in the 'users' table
      // This assumes your 'users' table's primary key is 'user_id' and maps to auth.users.id
      const { data, error } = await supabase
        .from("users")
        .update({
          username: formattedUsername,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", authUser.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating username:", error);
        alert(`Error updating username: ${error.message}`);
      } else if (data) {
        setUserProfile((prev) =>
          prev ? { ...prev, username: data.username } : null
        );
        setNewUsername("");
        setShowUsernameForm(false);
        alert("Username updated successfully!");
      }
    } catch (err) {
      console.error("Unexpected error updating username:", err);
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
      // 1. Find the target user by their username
      const { data: targetUser, error: findError } = await supabase
        .from("users")
        .select("user_id, username")
        .eq("username", targetUsername)
        .single();

      if (findError || !targetUser) {
        console.error("Error finding user or user not found:", findError);
        alert(`User "${targetUsername}" not found.`);
        setIsUpdatingUsername(false);
        return;
      }

      // 2. Add the friend relationship
      // Ensure user_id1 and user_id2 are ordered to prevent duplicate inverse entries if desired,
      // or rely on RLS/triggers to handle mutual friendship or prevent duplicates.
      // For this example, user_id1 will be the current user.
      const { error: addFriendError } = await supabase.from("friends").insert({
        user_id1: userProfile.user_id,
        user_id2: targetUser.user_id,
      });

      if (addFriendError) {
        // You might want to check for specific error codes, e.g., unique constraint violation (already friends)
        console.error("Error adding friend:", addFriendError);
        if (addFriendError.code === "23505") {
          // Unique violation
          alert(
            `${targetUsername} is already your friend or a pending request exists.`
          );
        } else {
          alert(`Error adding friend: ${addFriendError.message}`);
        }
      } else {
        // Add to local state immediately for better UX
        setFriends((prevFriends) => [
          ...prevFriends,
          { user_id: targetUser.user_id, username: targetUser.username },
        ]);
        setFriendUsernameToAdd("");
        alert(`${targetUsername} added as a friend!`);
        // Optionally re-fetch friends to ensure consistency if mutual logic is complex server-side
        // fetchFriends();
      }
    } catch (err) {
      console.error("Unexpected error adding friend:", err);
      alert("An unexpected error occurred while adding friend.");
    } finally {
      setIsUpdatingUsername(false); // Or the new loading state for adding friend
    }
  };

  // Handle Remove Friend
  const handleRemoveFriend = async (friendToRemove: Friend) => {
    if (!userProfile?.user_id) return;

    const confirmRemoval = window.confirm(
      `Are you sure you want to remove ${friendToRemove.username} as a friend?`
    );
    if (!confirmRemoval) return;

    setIsUpdatingUsername(true); // Re-use for loading state
    try {
      const currentUserId = userProfile.user_id;
      const friendUserId = friendToRemove.user_id;

      // Delete relationship where current user is user_id1 AND friend is user_id2
      // OR current user is user_id2 AND friend is user_id1
      const { error } = await supabase
        .from("friends")
        .delete()
        .or(
          `and(user_id1.eq.${currentUserId},user_id2.eq.${friendUserId}),and(user_id1.eq.${friendUserId},user_id2.eq.${currentUserId})`
        );

      if (error) {
        console.error("Error removing friend:", error);
        alert(`Error removing friend: ${error.message}`);
      } else {
        setFriends((prevFriends) =>
          prevFriends.filter((f) => f.user_id !== friendUserId)
        );
        alert(`${friendToRemove.username} removed from friends.`);
      }
    } catch (err) {
      console.error("Unexpected error removing friend:", err);
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

  if (!authUser || !userProfile) {
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
              <input
                type="text"
                value={friendUsernameToAdd}
                onChange={(e) => setFriendUsernameToAdd(e.target.value)}
                placeholder="Enter friend's username"
                className={`profile-input`} // Add invalid style if needed based on 'isFriendUsernameValid'
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

            <input
              type="text"
              value={searchTerm}
              onChange={(e) =>
                setSearchTerm(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))
              }
              placeholder="Search friends"
              className="profile-input"
              style={{ marginTop: "1rem" }}
              disabled={loadingFriends}
            />

            {loadingFriends ? (
              <p>Loading friends...</p>
            ) : (
              <div className="friends-list">
                {filteredFriends.length > 0 ? (
                  filteredFriends.map((friend) => (
                    <div
                      key={friend.user_id} // Use friend's user_id as key
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
