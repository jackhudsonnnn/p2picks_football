import React, { useState, useEffect } from "react";
import Modal from "../../shared/ui/Modal/Modal.tsx";
import FriendsList from "../profile/FriendsList";
import { useAuth } from "../../hooks/useAuth";
import { addTableMember, removeTableMember } from "@entities/table/service";
import { supabase } from "../../shared/api/supabaseClient";
import "./hostControls.css";

const HostControls: React.FC<{ tableId: string }> = ({ tableId }) => {
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Fetch friends
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
        .from("private_tables")
        .select("*, table_members(*, users(*))")
        .eq("table_id", tableId)
        .single();
      setMembers((table?.table_members || []).map((tm: any) => ({
        user_id: tm.user_id,
        username: tm.users?.username || tm.user_id,
      })));
    })();
  }, [tableId, showAdd, showRemove]);

  const handleToggle = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  const handleAddMembers = async () => {
    setLoading(true);
    for (const userId of selected) {
      await addTableMember(tableId!, userId);
    }
    setShowAdd(false);
    setSelected(new Set());
    setLoading(false);
  };

  const handleRemoveMembers = async () => {
    setLoading(true);
    for (const userId of selected) {
      await removeTableMember(tableId!, userId);
    }
    setShowRemove(false);
    setSelected(new Set());
    setLoading(false);
  };

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
          friends={friends.filter(f => !members.some(m => m.user_id === f.user_id))}
          selectedIds={selected}
          onToggle={handleToggle}
        />
        <button onClick={handleAddMembers} disabled={loading || selected.size === 0} className="action-button">Add Selected</button>
      </Modal>
      <Modal isOpen={showRemove} onClose={() => setShowRemove(false)} title="Remove Members">
        <FriendsList
          friends={members.filter(m => m.user_id !== user?.id)}
          selectedIds={selected}
          onToggle={handleToggle}
        />
        <button onClick={handleRemoveMembers} disabled={loading || selected.size === 0} className="action-button">Remove Selected</button>
      </Modal>
    </section>
  );
};

export default HostControls;