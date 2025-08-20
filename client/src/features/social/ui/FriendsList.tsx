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
  <div style={{ maxHeight: 300, overflowY: "auto" }}>
    {friends.length === 0 && <div>No friends found.</div>}
    {friends.map(friend => (
      <label key={friend.user_id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
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
