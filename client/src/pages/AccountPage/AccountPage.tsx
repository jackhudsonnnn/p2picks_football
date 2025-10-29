import React, { useState } from "react";
import "./AccountPage.css";
import { AccountNavigation, type AccountTab } from "@components/Social/AccountNavigation/AccountNavigation";
import { ProfileCard } from "@components/Social/ProfileCard/ProfileCard";
import { FriendsManager } from "@components/Social/FriendsManager/FriendsManager";
import { useAuth } from "@features/auth";
import { useAuthProfile } from "@features/social/hooks";

export const AccountPage: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { loading: profileLoading, error: profileError } = useAuthProfile();
  const [activeTab, setActiveTab] = useState<AccountTab>("profile");

  if (authLoading || profileLoading) {
    return <div className="account-loading">Loading account...</div>;
  }

  if (!user) {
    return <div className="account-loading">Please log in to view your account.</div>;
  }

  if (profileError) {
    return <div className="account-loading">{profileError}</div>;
  }

  return (
    <main className="container account-page">
      <div className="account-card">
        <AccountNavigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <section className="account-content" aria-live="polite">
          <div
            id="account-profile-panel"
            role="tabpanel"
            aria-labelledby="account-profile-tab"
            className="account-tab-panel"
            hidden={activeTab !== "profile"}
          >
            {activeTab === "profile" && <ProfileCard />}
          </div>

          <div
            id="account-friends-panel"
            role="tabpanel"
            aria-labelledby="account-friends-tab"
            className="account-tab-panel"
            hidden={activeTab !== "friends"}
          >
            {activeTab === "friends" && <FriendsManager />}
          </div>

          <div
            id="account-friendRequests-panel"
            role="tabpanel"
            aria-labelledby="account-friendRequests-tab"
            className="account-tab-panel"
            hidden={activeTab !== "friendRequests"}
          >
            {activeTab === "friendRequests" && (
              <section className="profile-section account-placeholder">
                <h3>Friend Requests</h3>
                <p>Friend requests will appear here soon. Stay tuned!</p>
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};
