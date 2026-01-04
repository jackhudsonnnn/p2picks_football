import React, { useEffect, useState } from "react";
import { useAuth } from "@features/auth";
import { useAuthProfile, useUsernameUpdater } from "@features/social/hooks";
import "./ProfileCard.css";
import { useDialog } from "@shared/hooks/useDialog";

export const ProfileCard: React.FC = () => {
  const { user } = useAuth();
  const { profile, loading, refresh } = useAuthProfile();
  const { update, loading: updating, error } = useUsernameUpdater(user?.id);
  const [username, setUsername] = useState("");
  const { showAlert, dialogNode } = useDialog();

  useEffect(() => {
    setUsername(profile?.username ?? "");
  }, [profile?.username]);

  const trimmedUsername = username.trim();
  const isUsernameValid =
    trimmedUsername.length >= 3 &&
    trimmedUsername.length <= 10 &&
    /^[a-zA-Z0-9_]+$/.test(trimmedUsername);
  const showInvalid = trimmedUsername.length > 0 && !isUsernameValid;
  if (!user || !profile) {
    return (
      <>
      </>
    );
  }

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (!user || !isUsernameValid) return;
    if (profile.username && profile.username === trimmedUsername) {
      await showAlert({ title: "Update Username", message: "Please enter a new username to update." });
      return;
    }

    const saved = await update(trimmedUsername);
    if (saved) {
      await showAlert({ title: "Update Username", message: "Username updated successfully!" });
      setUsername(saved.username ?? trimmedUsername);
      await refresh();
    } else {
      await showAlert({
        title: "Update Username",
        message: error ?? "Failed to update username.",
      });
    }
  };

  return (
    <>
      <section className="profile-container">
        {loading ? (
          <>
            <div>Loading profile...</div>
            {dialogNode}
          </>
        ) : (
        <div className="username-section">
          <div className="current-username">
            <p className="change-username-label">
              {profile.username
                ? "Change Username"
                : "No username set. Please create one."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="username-form">
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={
                profile.username ? "New username" : "Create a Username"
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
                {updating ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
        )}
      </section>
      {dialogNode}
    </>
  );
};

export default ProfileCard;
