import React from "react";
import "./Navigation.css";

interface NavigationProps {
  activeTab: "chat" | "members" | "controls";
  setActiveTab: (tab: "chat" | "members" | "controls") => void;
  memberCount: number;
  isHost: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab, memberCount, isHost }) => (
  <nav className="table-navigation" aria-label="Table navigation">
    <div className="tab-section">
      <div className="tab-buttons" role="tablist">
        <button type="button" className={`tab-button${activeTab === "chat" ? " active" : ""}`} aria-selected={activeTab === "chat"} aria-controls="chat-panel" onClick={() => setActiveTab("chat")}>Chat</button>
        <button type="button" className={`tab-button${activeTab === "members" ? " active" : ""}`} aria-selected={activeTab === "members"} aria-controls="members-panel" onClick={() => setActiveTab("members")}>Members <span aria-label={`${memberCount} members`}>({memberCount})</span></button>
        {isHost && (
          <button type="button" className={`tab-button${activeTab === "controls" ? " active" : ""}`} aria-selected={activeTab === "controls"} aria-controls="controls-panel" onClick={() => setActiveTab("controls")}>Controls</button>
        )}
      </div>
    </div>
  </nav>
);
