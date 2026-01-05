import React, { useMemo, useState, useCallback } from "react";
import { Modal } from "@shared/widgets/Modal/Modal";
import { UserList, type UserItem, type UserActionProps } from "@components/Social/UserList/UserList";
import { CheckIcon } from "@shared/widgets/icons/CheckIcon";
import { XIcon } from "@shared/widgets/icons/XIcon";
import { useFriends } from "@features/social/hooks";
import {
  addTableMember,
  removeTableMember,
  settleTable,
  type TableSettlementResult,
} from '@features/table/services/tableService';
import "./hostControls.css";
import { useDialog } from "@shared/hooks/useDialog";

export interface HostControlsMember { user_id: string; username: string; balance?: number; }

interface HostControlsProps {
  tableId: string;
  members: HostControlsMember[];
  currentUserId: string;
}

interface AddMemberActionProps extends UserActionProps {
  onAdd: (user: UserItem) => void;
}

const AddMemberAction: React.FC<AddMemberActionProps> = ({ user, disabled, onAdd }) => (
  <button
    type="button"
    className="host-action-btn add"
    onClick={() => onAdd(user)}
    disabled={disabled}
    aria-label={`Add ${user.username}`}
  >
    <CheckIcon />
  </button>
);

interface RemoveMemberActionProps extends UserActionProps {
  onRemove: (user: UserItem) => void;
}

const RemoveMemberAction: React.FC<RemoveMemberActionProps> = ({ user, disabled, onRemove }) => (
  <button
    type="button"
    className="host-action-btn remove"
    onClick={() => onRemove(user)}
    disabled={disabled}
    aria-label={`Remove ${user.username}`}
  >
    <XIcon />
  </button>
);

export const HostControls: React.FC<HostControlsProps> = ({ tableId, members, currentUserId }) => {
  const { friends, loading: friendsLoading, refresh: refreshFriends } = useFriends(currentUserId);
  const [showAdd, setShowAdd] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settlementResult, setSettlementResult] = useState<TableSettlementResult | null>(null);
  const [settlementError, setSettlementError] = useState<string | null>(null);
  const { showAlert, showConfirm, dialogNode } = useDialog();

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
      console.error(err);
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
      console.error(err);
      await showAlert({ title: "Remove Member", message: "Failed to remove member." });
    } finally {
      setMutating(false);
    }
  }, [tableId, showConfirm, showAlert, refreshFriends]);

  const AddActionComponent = useCallback(
    (props: UserActionProps) => <AddMemberAction {...props} onAdd={handleAddMember} />,
    [handleAddMember]
  );

  const RemoveActionComponent = useCallback(
    (props: UserActionProps) => <RemoveMemberAction {...props} onRemove={handleRemoveMember} />,
    [handleRemoveMember]
  );

  const handleOpenSettlement = () => {
    setSettlementResult(null);
    setSettlementError(null);
    setShowSettle(true);
  };

  const handleCloseSettlement = () => {
    if (settlementLoading) return;
    setShowSettle(false);
    setSettlementResult(null);
    setSettlementError(null);
  };

  const parseSettlementError = (err: unknown): string => {
    if (!err) return 'Failed to settle the table. Please try again.';
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message || 'Failed to settle the table. Please try again.';
    if (typeof err === 'object') {
      const maybeMessage = (err as any)?.message ?? (err as any)?.error_description ?? (err as any)?.error;
      if (maybeMessage && typeof maybeMessage === 'string') return maybeMessage;
    }
    return 'Failed to settle the table. Please try again.';
  };

  const handleConfirmSettlement = async () => {
    if (!tableId) return;
    setSettlementLoading(true);
    setSettlementError(null);
    try {
      const result = await settleTable(tableId);
      setSettlementResult(result);
    } catch (err) {
      console.error('[HostControls] Failed to settle table', err);
      setSettlementError(parseSettlementError(err));
    } finally {
      setSettlementLoading(false);
    }
  };

  return (
    <section className="host-controls-container" aria-label="Host controls">
      <header className="controls-header">
        <span>Host Controls</span>
      </header>
      <div className="host-actions">
        <div className="action-buttons">
          <button className="action-button" onClick={() => setShowAdd(true)} type="button">Add Members</button>
          <button className="action-button" onClick={() => setShowRemove(true)} type="button">Remove Members</button>
          <button className="action-button" onClick={handleOpenSettlement} type="button">Settle Table Balances</button>
        </div>
      </div>
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Members">
        <UserList
          users={eligibleFriends}
          ActionComponent={AddActionComponent}
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
          ActionComponent={RemoveActionComponent}
          onRowClick={handleRemoveMember}
          emptyMessage="No removable members."
          disabled={mutating}
        />
      </Modal>
      <Modal
        isOpen={showSettle}
        onClose={handleCloseSettlement}
        title={settlementResult ? "Table Settled" : "Settle Table"}
        footer={(
          <>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={handleCloseSettlement}
              disabled={settlementLoading}
            >
              {settlementResult ? "Close" : "Cancel"}
            </button>
            {!settlementResult && (
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleConfirmSettlement}
                disabled={settlementLoading}
              >
                {settlementLoading ? "Settling…" : "Confirm"}
              </button>
            )}
          </>
        )}
      >
        {settlementResult ? (
          <div className="settlement-summary">
            <p className="settlement-summary__intro">
              All member balances are now zero. The following ledger was posted to the chat:
            </p>
            <pre className="settlement-summary__ledger">{settlementResult.summary}</pre>
          </div>
        ) : (
          <div className="settlement-warning">
            <p>
              <strong>Heads up:</strong> Settling the table will reset every member&apos;s balance to 0.
            </p>
            <ul>
              <li>All bets should be resolved or washed before you settle.</li>
              <li>A settlement summary will be posted to the table&apos;s chat history.</li>
              <li>This action can&apos;t be undone.</li>
            </ul>
            <p>Are you sure you want to continue?</p>
          </div>
        )}
        {settlementError && (
          <p className="settlement-error" role="alert">{settlementError}</p>
        )}
      </Modal>
      {dialogNode}
    </section>
  );
};