import React, { useMemo, useState } from "react";
import { Modal } from "@shared/widgets";
import { FriendsList } from "@shared/widgets/FriendsList/FriendsList";
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
  members: HostControlsMember[]; // passed from parent (already subscribed)
  currentUserId: string;
}

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

  const eligibleFriends = useMemo(
    () => friends.filter(f => !members.some(m => m.user_id === f.user_id)),
    [friends, members]
  );
  const removableMembers = useMemo(
    () => members.filter(m => m.user_id !== currentUserId),
    [members, currentUserId]
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
      <div className="host-controls-panel">
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
            const confirmed = await showConfirm({
              title: "Add Member",
              message: `Add ${username} to the table?`,
              confirmLabel: "Add",
            });
            if (!confirmed) return;
            setMutating(true);
            try {
              await addTableMember(tableId, userId);
              await refreshFriends();
              setShowAdd(false);
            } catch (err) {
              console.error(err);
              await showAlert({ title: "Add Member", message: "Failed to add member." });
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
            const confirmed = await showConfirm({
              title: "Remove Member",
              message: `Remove ${username} from the table?`,
              confirmLabel: "Remove",
            });
            if (!confirmed) return;
            setMutating(true);
            try {
              await removeTableMember(tableId, userId);
              await refreshFriends();
              setShowRemove(false);
            } catch (err) {
              console.error(err);
              await showAlert({ title: "Remove Member", message: "Failed to remove member." });
            } finally {
              setMutating(false);
            }
          }}
          emptyMessage="No removable members."
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
                {settlementLoading ? "Settling…" : "Confirm Settlement"}
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