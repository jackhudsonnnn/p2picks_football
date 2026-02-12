import React, { useMemo, useState, useCallback } from "react";
import { Modal } from "@shared/widgets/Modal/Modal";
import { UserList, type UserItem, type UserActionProps } from "@components/Social/UserList/UserList";
import { CheckIcon } from "@shared/widgets/icons/CheckIcon";
import { XIcon } from "@shared/widgets/icons/XIcon";
import { useFriends } from "@features/social/hooks";
import { logger } from "@shared/utils/logger";
import {
  addTableMember,
  removeTableMember,
  settleTable,
} from '@features/table/services/tableService';
import "./HostControls.css";
import { useDialog } from "@shared/hooks/useDialog";
import { getErrorMessage } from "@shared/utils/error";

interface HostControlsMember { 
  user_id: string; 
  username: string; 
  bust_balance?: number;
  push_balance?: number;
  sweep_balance?: number;
}

interface HostControlsProps {
  tableId: string;
  members: HostControlsMember[];
  currentUserId: string;
}

export const HostControls: React.FC<HostControlsProps> = ({ tableId, members, currentUserId }) => {
  const { friends, loading: friendsLoading, refresh: refreshFriends } = useFriends(currentUserId);
  const [showAdd, setShowAdd] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const { showAlert, showConfirm, dialogNode } = useDialog();

  const AddAction: React.FC<UserActionProps> = () => <CheckIcon />;
  const RemoveAction: React.FC<UserActionProps> = () => <XIcon />;

  const eligibleFriends: UserItem[] = useMemo(
    () => friends
      .filter(f => !members.some(m => m.user_id === f.user_id))
      .map(f => ({ id: f.user_id, username: f.username })),
    [friends, members]
  );

  const removableMembers: UserItem[] = useMemo(
    () => members
      .filter(m => m.user_id !== currentUserId)
      .map(m => ({ id: m.user_id, username: m.username })),
    [members, currentUserId]
  );

  const handleAddMember = useCallback(async (user: UserItem) => {
    if (!tableId) return;
    const confirmed = await showConfirm({
      title: "Add Member",
      message: `Add ${user.username} to the table?`,
      confirmLabel: "Add",
    });
    if (!confirmed) return;
    setMutating(true);
    try {
      await addTableMember(tableId, user.id);
      await refreshFriends();
      setShowAdd(false);
    } catch (err) {
      logger.error(err);
      await showAlert({ title: "Add Member", message: "Failed to add member." });
    } finally {
      setMutating(false);
    }
  }, [tableId, showConfirm, showAlert, refreshFriends]);

  const handleRemoveMember = useCallback(async (user: UserItem) => {
    if (!tableId) return;
    const confirmed = await showConfirm({
      title: "Remove Member",
      message: `Remove ${user.username} from the table?`,
      confirmLabel: "Remove",
    });
    if (!confirmed) return;
    setMutating(true);
    try {
      await removeTableMember(tableId, user.id);
      await refreshFriends();
      setShowRemove(false);
    } catch (err) {
      logger.error(err);
      await showAlert({ title: "Remove Member", message: "Failed to remove member." });
    } finally {
      setMutating(false);
    }
  }, [tableId, showConfirm, showAlert, refreshFriends]);

  const parseSettlementError = (err: unknown): string => {
    return getErrorMessage(err, 'Failed to settle the table. Please try again.');
  };

  const handleConfirmSettlement = useCallback(async () => {
    if (!tableId || settlementLoading) return;

    const confirmed = await showConfirm({
      title: 'Settle Table',
      message: (
        <div>
          <p>Settling the table will reset every member&apos;s push balance to 0. A settlement summary will be posted to the table.</p>
        </div>
      ),
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
    });

    if (!confirmed) return;

    setSettlementLoading(true);
    try {
      await settleTable(tableId);
      await showAlert({
        title: 'Table Settled',
        message: 'All member balances are now zero.',
      });
    } catch (err) {
      logger.error('[HostControls] Failed to settle table', err);
      await showAlert({
        title: 'Settle Table',
        message: parseSettlementError(err),
      });
    } finally {
      setSettlementLoading(false);
    }
  }, [tableId, settlementLoading, showConfirm, showAlert]);

  return (
    <section className="host-controls-container" aria-label="Host controls">
      <header className="controls-header">
        <span>Host Controls</span>
      </header>
      <div className="host-actions">
        <div className="action-buttons">
          <button className="action-button" onClick={() => setShowAdd(true)} type="button">Add Members</button>
          <button className="action-button" onClick={() => setShowRemove(true)} type="button">Remove Members</button>
          <button className="action-button" onClick={handleConfirmSettlement} type="button" disabled={settlementLoading}>
            {settlementLoading ? 'Settling…' : 'Settle Table Balances'}
          </button>
        </div>
      </div>
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Members">
        <UserList
          users={eligibleFriends}
          ActionComponent={AddAction}
          onRowClick={handleAddMember}
          loading={friendsLoading}
          loadingMessage="Loading friends..."
          emptyMessage="No eligible friends to add."
          disabled={mutating}
        />
      </Modal>
      <Modal isOpen={showRemove} onClose={() => setShowRemove(false)} title="Remove Members">
        <UserList
          users={removableMembers}
          ActionComponent={RemoveAction}
          onRowClick={handleRemoveMember}
          emptyMessage="No removable members."
          disabled={mutating}
        />
      </Modal>
      {dialogNode}
    </section>
  );
};