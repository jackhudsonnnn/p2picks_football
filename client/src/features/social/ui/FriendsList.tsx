import React from "react";
import "./FriendsList.css";

interface Friend {
  user_id: string;
  username: string;
}

interface FriendsListProps {
  friends: Friend[];
  selectedIds: Set<string>;
  onToggle: (userId: string) => void;
}

// Use the same CSS classes as AccountPage to stay DRY with styles
const FriendsList: React.FC<FriendsListProps> = ({ friends, selectedIds, onToggle }) => (
  <div className="friends-list">
  {friends.length === 0 && <div>No friends found.</div>}
    {friends.map(friend => {
      const isSelected = selectedIds.has(friend.user_id);
      return (
        <div key={friend.user_id} className="friend-item container-primary">
          <div className="friend-info">
            <img
              src={`https://ui-avatars.com/api/?name=${friend.username}&background=random`}
              alt={`${friend.username}'s avatar`}
              className="friend-avatar"
            />
            <div>
              <span className="friend-username">{friend.username}</span>
            </div>
          </div>
          <button
            className={`friend-select-btn ${isSelected ? 'selected' : ''}`}
            onClick={() => onToggle(friend.user_id)}
            aria-pressed={isSelected}
            title={isSelected ? 'Deselect' : 'Select'}
          >
            {isSelected ? '✓' : '☐'}
          </button>
        </div>
      );
    })}
  </div>
);

export default FriendsList;
