import React from "react";
import "./AccountNavigation.css";

export type AccountTab = "profile" | "friends" | "friendRequests";

interface AccountNavigationProps {
  activeTab: AccountTab;
  onTabChange: (tab: AccountTab) => void;
  playerName?: string | null;
}

const TAB_LABELS: Record<AccountTab, string> = {
  profile: "Profile",
  friends: "Friends",
  friendRequests: "Requests",
};

const TAB_ORDER: AccountTab[] = ["profile", "friends", "friendRequests"];

export const AccountNavigation: React.FC<AccountNavigationProps> = ({
  activeTab,
  onTabChange,
}) => {
  return (
    <nav className="account-navigation" aria-label="Account navigation">
      <div className="account-tab-container-bg">
        <div role="tablist">
          {TAB_ORDER.map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              className={`account-tab-button${activeTab === tabKey ? " active" : ""}`}
              role="tab"
              aria-selected={activeTab === tabKey}
              aria-controls={`account-${tabKey}-panel`}
              id={`account-${tabKey}-tab`}
              tabIndex={activeTab === tabKey ? 0 : -1}
              onClick={() => onTabChange(tabKey)}
            >
              {TAB_LABELS[tabKey]}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default AccountNavigation;
