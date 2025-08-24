import React, { useState, useEffect } from "react";
import { Modal } from "@shared/widgets";
import FriendsList from "@shared/widgets/FriendsList/FriendsList";
import { useAuth } from "@features/auth";
import { addTableMember, removeTableMember } from '@shared/api/tableService';
import { supabase } from "@shared/api/supabaseClient";
import "./hostControls.css";

export const HostControls: React.FC<{ tableId: string }> = ({ tableId }) => {
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: friendRelations } = await supabase
        .from("friends")
        .select("user_id1, user_id2").or(`user_id1.eq.${user.id},user_id2.eq.${user.id}`);
      const friendIds = (friendRelations || []).map((rel: any) => rel.user_id1 === user.id ? rel.user_id2 : rel.user_id1);
      if (friendIds.length) {
        const { data: friendProfiles } = await supabase
          .from("users").select("user_id, username").in("user_id", friendIds);
        setFriends(friendProfiles || []);
      } else {
        setFriends([]);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!tableId) return;
    (async () => {
      const { data: table } = await supabase
        .from("tables")
        .select("*, table_members(*, users(*))")
        .eq("table_id", tableId)
        .single();
      setMembers((table?.table_members || []).map((tm: any) => ({
        user_id: tm.user_id,
        username: tm.users?.username || tm.user_id,
      })));
    })();
  }, [tableId, showAdd, showRemove]);

  // per-row actions now handle add/remove with confirmation via onAction

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
          friends={friends.filter(f => !members.some(m => m.user_id === f.user_id))}
          disabled={loading}
          addSymbol="✔"
          onAction={async (userId: string, username: string) => {
            if (!tableId) return;
            if (!window.confirm(`Are you sure you want to add ${username} to the table?`)) return;
            setLoading(true);
            try {
              await addTableMember(tableId, userId);
              // refresh handled by effect watching showAdd/showRemove; close modal
              setShowAdd(false);
            } catch (err) {
              console.error(err);
              alert('An error occurred while adding member.');
            } finally {
              setLoading(false);
            }
          }}
          emptyMessage="No eligible friends to add."
        />
      </Modal>
      <Modal isOpen={showRemove} onClose={() => setShowRemove(false)} title="Remove Members">
        <FriendsList
          mode="select"
          variant="remove"
          friends={members.filter(m => m.user_id !== user?.id)}
          disabled={loading}
          removeSymbol="✖"
          onAction={async (userId: string, username: string) => {
            if (!tableId) return;
            if (!window.confirm(`Are you sure you want to remove ${username} from the table?`)) return;
            setLoading(true);
            try {
              await removeTableMember(tableId, userId);
              setShowRemove(false);
            } catch (err) {
              console.error(err);
              alert('An error occurred while removing member.');
            } finally {
              setLoading(false);
            }
          }}
          emptyMessage="No removable members."
        />
      </Modal>
    </section>
  );
};