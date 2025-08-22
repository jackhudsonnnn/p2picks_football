import React, { useState } from "react";
import { useAuth } from "@features/auth";
import { useAuthProfile, useUsernameUpdater } from "../../hooks";
import "./ProfileCard.css";

export const ProfileCard: React.FC = () => {
  const { user } = useAuth();
  const { profile, loading } = useAuthProfile();
  const { update, loading: updating, error } = useUsernameUpdater(user?.id);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");

  if (loading) return <div>Loading profile...</div>;
  if (!user || !profile) return <div>Please log in to view your account.</div>;

  const isUsernameValid =
    username.trim().length >= 3 &&
    username.trim().length <= 15 &&
    /^[a-zA-Z0-9_]+$/.test(username.trim());
  const isEmpty = username.trim() === "";
  const showInvalid = !isEmpty && !isUsernameValid;
  const startEdit = () => {
    setUsername(profile.username || "");
    setShowForm(true);
  };

  const onSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();
    if (!isUsernameValid || !user) return;
    const saved = await update(username);
    if (saved) {
      alert("Username updated successfully!");
      setShowForm(false);
      setUsername("");
    } else if (error) {
      alert(error);
    }
  };

  return (
    <section className="profile-section">
      <h2>Profile</h2>
      <div className="username-section">
        <div className="current-username">
          <h3>Username</h3>
          <p>
            {profile.username
              ? `Hello, ${profile.username}!`
              : "No username set. Please create one."}
          </p>
          {!showForm && profile.username && (
            <button
              className="btn-primary change-username-btn"
              onClick={startEdit}
              disabled={updating}
            >
              Change Username
            </button>
          )}
          {!profile.username && !showForm && (
            <button
              className="btn-primary"
              onClick={startEdit}
              disabled={updating}
            >
              Create Username
            </button>
          )}
        </div>
        {showForm && (
          <form onSubmit={onSubmit} className="username-form">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={
                profile.username ? "Enter new username" : "Create a Username"
              }
              className={`profile-input ${
                showInvalid ? "profile-input-invalid" : ""
              }`}
              disabled={updating}
              maxLength={15}
            />
            {showInvalid && (
              <small style={{ color: "var(--accent-power)" }}>
                3-15 chars, A-Z, 0-9, _
              </small>
            )}
            <div className="form-buttons">
              <button
                type="submit"
                className="btn-primary"
                disabled={updating || (!isUsernameValid && !isEmpty)}
              >
                {updating ? "Saving..." : "Save"}
              </button>
              {profile.username && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowForm(false);
                    setUsername("");
                  }}
                  disabled={updating}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  );
};
export default ProfileCard;
