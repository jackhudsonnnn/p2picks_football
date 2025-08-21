import React from "react";

interface Friend {
  user_id: string;
  username: string;
}

interface FriendsListProps {
  friends: Friend[];
  selectedIds: Set<string>;
  onToggle: (userId: string) => void;
}

const FriendsList: React.FC<FriendsListProps> = ({ friends, selectedIds, onToggle }) => (
  <div className="friends-list-container">
    {friends.length === 0 && <div className="friends-list-empty">No friends found.</div>}
    {friends.map(friend => (
      <label key={friend.user_id} className="friends-list-label">
        <input
          type="checkbox"
          checked={selectedIds.has(friend.user_id)}
          onChange={() => onToggle(friend.user_id)}
        />
        <span>{friend.username}</span>
      </label>
    ))}
  </div>
);

export default FriendsList;
