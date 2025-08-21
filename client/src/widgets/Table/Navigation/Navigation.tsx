import React from "react";
import "./Navigation.css";

interface NavigationProps {
  activeTab: "chat" | "members" | "controls";
  setActiveTab: (tab: "chat" | "members" | "controls") => void;
  memberCount: number;
  isHost: boolean;
  tableName?: string;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab, memberCount, isHost, tableName }) => (
  <nav className="table-navigation" aria-label="Table navigation">
    <div className="table-name" aria-label="Table name">{tableName}</div>

    <div className="tab-section">
      <div className="tab-buttons" role="tablist">
        <button type="button" className={`tab-button${activeTab === "chat" ? " active" : ""}`} aria-current={activeTab === "chat" ? "true" : undefined} aria-controls="chat-panel" onClick={() => setActiveTab("chat")}>Chat</button>
        <button type="button" className={`tab-button${activeTab === "members" ? " active" : ""}`} aria-current={activeTab === "members" ? "true" : undefined} aria-controls="members-panel" onClick={() => setActiveTab("members")}>Members <span aria-label={`${memberCount} members`}>({memberCount})</span></button>
        {isHost && (
          <button type="button" className={`tab-button${activeTab === "controls" ? " active" : ""}`} aria-current={activeTab === "controls" ? "true" : undefined} aria-controls="controls-panel" onClick={() => setActiveTab("controls")}>Controls</button>
        )}
      </div>
    </div>
  </nav>
);
