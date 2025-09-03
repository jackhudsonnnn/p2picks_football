import React, { useState } from "react";
import { Modal } from "@shared/widgets";
import { FriendsList } from "@shared/widgets/FriendsList/FriendsList";
import { useAuth } from "@features/auth";
import { useFriends } from "@features/social/hooks";
import { addTableMember, removeTableMember } from '@shared/api/tableService';
import "./hostControls.css";

export interface HostControlsMember { user_id: string; username: string; }

interface HostControlsProps {
  tableId: string;
  members: HostControlsMember[]; // passed from parent (already subscribed)
  currentUserId: string;
}

export const HostControls: React.FC<HostControlsProps> = ({ tableId, members, currentUserId }) => {
  const { user } = useAuth(); // keep for auth context if needed later
  const { friends, loading: friendsLoading } = useFriends(user?.id);
  const [showAdd, setShowAdd] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [mutating, setMutating] = useState(false);

  const eligibleFriends = friends.filter(f => !members.some(m => m.user_id === f.user_id));
  const removableMembers = members.filter(m => m.user_id !== currentUserId);

  return (
    <section className="host-controls-container" aria-label="Host controls">
      <div className="host-controls-panel">
        <header className="controls-header">
          <span>Host Controls</span>
        </header>
        <div className="host-actions">
          <div className="action-buttons">
            <button className="action-button" onClick={() => setShowAdd(true)} type="button">Add Members</button>
            <button className="action-button" onClick={() => setShowRemove(true)} type="button">Remove Members</button>
            <button className="action-button" type="button">Settle Table Balances</button>
          </div>
        </div>
      </div>
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Members">
        <FriendsList
          mode="select"
          variant="add"
          friends={eligibleFriends}
          disabled={mutating || friendsLoading}
          addSymbol="✔"
          onAction={async (userId: string, username: string) => {
            if (!tableId) return;
            if (!window.confirm(`Add ${username} to the table?`)) return;
            setMutating(true);
            try {
              await addTableMember(tableId, userId);
              setShowAdd(false); // realtime will update parent
            } catch (err) {
              console.error(err);
              alert('Failed to add member');
            } finally {
              setMutating(false);
            }
          }}
          emptyMessage="No eligible friends to add."
        />
      </Modal>
      <Modal isOpen={showRemove} onClose={() => setShowRemove(false)} title="Remove Members">
        <FriendsList
          mode="select"
          variant="remove"
          friends={removableMembers}
          disabled={mutating}
          removeSymbol="✖"
          onAction={async (userId: string, username: string) => {
            if (!tableId) return;
            if (!window.confirm(`Remove ${username} from the table?`)) return;
            setMutating(true);
            try {
              await removeTableMember(tableId, userId);
              setShowRemove(false);
            } catch (err) {
              console.error(err);
              alert('Failed to remove member');
            } finally {
              setMutating(false);
            }
          }}
          emptyMessage="No removable members."
        />
      </Modal>
    </section>
  );
};