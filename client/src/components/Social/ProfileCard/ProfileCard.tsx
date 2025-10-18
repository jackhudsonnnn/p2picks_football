import React, { useEffect, useState } from "react";
import { useAuth } from "@features/auth";
import { useAuthProfile, useUsernameUpdater } from "@features/social/hooks";
import "./ProfileCard.css";

export const ProfileCard: React.FC = () => {
  const { user } = useAuth();
  const { profile, loading, refresh } = useAuthProfile();
  const { update, loading: updating, error } = useUsernameUpdater(user?.id);
  const [username, setUsername] = useState("");

  useEffect(() => {
    setUsername(profile?.username ?? "");
  }, [profile?.username]);

  const trimmedUsername = username.trim();
  const isUsernameValid =
    trimmedUsername.length >= 3 &&
    trimmedUsername.length <= 10 &&
    /^[a-zA-Z0-9_]+$/.test(trimmedUsername);
  const showInvalid = trimmedUsername.length > 0 && !isUsernameValid;

  if (loading) return <div>Loading profile...</div>;
  if (!user || !profile) return <div>Please log in to view your account.</div>;

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (!user || !isUsernameValid) return;
    if (profile.username && profile.username === trimmedUsername) {
      alert("Please enter a new username to update.");
      return;
    }

    const saved = await update(trimmedUsername);
    if (saved) {
      alert("Username updated successfully!");
      setUsername(saved.username ?? trimmedUsername);
      await refresh();
    } else {
      alert(error ?? "Failed to update username.");
    }
  };

  return (
    <section className="profile-section">
      <div className="username-section">
        <div className="current-username">
          <h3>Username</h3>
          <p>
            {profile.username
              ? `Hello, ${profile.username}!`
              : "No username set. Please create one."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="username-form">
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={
              profile.username ? "Enter new username" : "Create a Username"
            }
            className={`profile-input ${
              showInvalid ? "profile-input-invalid" : ""
            }`}
            disabled={updating}
            maxLength={10}
            aria-invalid={showInvalid}
            aria-describedby="username-requirements"
          />
          <div className="form-buttons">
            <button
              type="submit"
              className="btn-primary save-btn"
              disabled={updating || !isUsernameValid}
            >
              {updating ? "Saving..." : "Confirm"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default ProfileCard;
