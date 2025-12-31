import React from 'react';
import './TableNavigation.css';

export type TableNavigationTab = 'chat' | 'members' | 'controls' | 'modes';

interface NavigationProps {
  activeTab: TableNavigationTab;
  setActiveTab: (tab: TableNavigationTab) => void;
  isHost: boolean;
}

export const TableNavigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab, isHost }) => (
  <nav className="table-navigation" aria-label="Table navigation">
    <div className="tab-section">
      <div className="table-tab-buttons" role="tablist">
        <button
          type="button"
          className={`table-tab-button${activeTab === 'chat' ? ' active' : ''}`}
          aria-current={activeTab === 'chat' ? 'true' : undefined}
          aria-controls="chat-panel"
          onClick={() => setActiveTab('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          className={`table-tab-button${activeTab === 'members' ? ' active' : ''}`}
          aria-current={activeTab === 'members' ? 'true' : undefined}
          aria-controls="members-panel"
          onClick={() => setActiveTab('members')}
        >
          Members
        </button>
        <button
          type="button"
          className={`table-tab-button${activeTab === 'modes' ? ' active' : ''}`}
          aria-current={activeTab === 'modes' ? 'true' : undefined}
          aria-controls="modes-panel"
          onClick={() => setActiveTab('modes')}
        >
          Modes
        </button>
        {isHost && (
          <button
            type="button"
            className={`table-tab-button${activeTab === 'controls' ? ' active' : ''}`}
            aria-current={activeTab === 'controls' ? 'true' : undefined}
            aria-controls="controls-panel"
            onClick={() => setActiveTab('controls')}
          >
            Controls
          </button>
        )}
      </div>
    </div>
  </nav>
);
