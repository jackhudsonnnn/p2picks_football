import React, { useState, useMemo, useCallback } from "react";
import "./memberList.css";
import type { TableMember, BalanceType } from "@features/table/types";
import { UserList, type UserItem, type UserActionProps } from "@components/Social/UserList/UserList";
import { formatSignedCurrency, normalizeToHundredth } from "@shared/utils/number";
import { useAuth } from "@features/auth";
import { useAuthProfile, useFriends } from "@features/social/hooks";
import { useDialog } from "@shared/hooks/useDialog";
import { HttpError } from "@data/clients/restClient";

export type MemberListMember = TableMember;

interface MemberListProps {
  members: MemberListMember[];
}

// Extended user item to include all three balances
interface MemberUserItem extends UserItem {
  bust_balance: number;
  push_balance: number;
  sweep_balance: number;
}

interface MemberBalanceActionProps extends UserActionProps {
  user: MemberUserItem;
  onMemberClick: (member: MemberUserItem) => void;
  balanceType: BalanceType;
}

const BALANCE_LABELS: Record<BalanceType, string> = {
  bust: 'Bust',
  push: 'Push',
  sweep: 'Sweep',
};

const BALANCE_DESCRIPTIONS: Record<BalanceType, string> = {
  bust: 'Bust Balance assumes you incorrectly chose all pending bets.',
  push: 'Push Balance assumes all pending bets end in a wash; note that every table member\'s balance sums to 0.',
  sweep: 'Sweep Balance assumes you\'ve chosen the correct answer in all pending bets.',
};

const MemberBalanceAction: React.FC<MemberBalanceActionProps> = ({ user, disabled, onMemberClick, balanceType }) => {
  const balanceValue = normalizeToHundredth(
    balanceType === 'bust' ? user.bust_balance :
    balanceType === 'push' ? user.push_balance :
    user.sweep_balance
  );
  const isNegative = balanceValue < 0;
  const isZero = balanceValue === 0;
  const balanceClass = isZero ? "zero" : isNegative ? "negative" : "positive";
  const balanceLabel = formatSignedCurrency(balanceValue);

  return (
    <div
      className={`member-balance-action ${balanceClass} ${disabled ? 'disabled' : ''}`}
      onClick={() => {
        if (disabled) return;
        onMemberClick(user);
      }}
      aria-label={`${BALANCE_LABELS[balanceType]} balance for ${user.username}: ${balanceLabel}. Click to send friend request.`}
      aria-disabled={disabled}
      title={balanceLabel}
    >
      <span className="balance-badge">{balanceLabel}</span>
    </div>
  );
};

interface BalanceToggleProps {
  value: BalanceType;
  onChange: (value: BalanceType) => void;
}

const BalanceToggle: React.FC<BalanceToggleProps> = ({ value, onChange }) => {
  const options: BalanceType[] = ['bust', 'push', 'sweep'];

  return (
    <div className="balance-toggle" role="tablist" aria-label="Balance type selector">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={value === option}
          className={`balance-toggle-option ${value === option ? 'active' : ''}`}
          onClick={() => onChange(option)}
        >
          {BALANCE_LABELS[option]}
        </button>
      ))}
    </div>
  );
};

export const MemberList: React.FC<MemberListProps> = ({ members }) => {
  const { user } = useAuth();
  const { profile } = useAuthProfile();
  const { friends, add } = useFriends(profile?.user_id || undefined);
  const { showAlert, showConfirm, dialogNode } = useDialog();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [balanceType, setBalanceType] = useState<BalanceType>('bust');

  const friendIds = useMemo(() => new Set(friends.map((f) => f.user_id)), [friends]);

  const memberUsers: MemberUserItem[] = useMemo(
    () => members.map((m) => ({
      id: m.user_id,
      username: m.username,
      bust_balance: m.bust_balance,
      push_balance: m.push_balance,
      sweep_balance: m.sweep_balance,
    })),
    [members]
  );

  const handleMemberClick = useCallback(async (member: UserItem) => {
    if (!profile || !profile.user_id) return;
    if (busyId) return;
    if (member.id === profile.user_id) {
      await showAlert({ title: "Friend Request", message: "You cant add yourself as a friend!" });
      return;
    }
    if (friendIds.has(member.id)) {
      await showAlert({ title: "Friend Request", message: `${member.username} is already your friend!` });
      return;
    }

    const confirmed = await showConfirm({
      title: "Send Friend Request",
      message: `Send a friend request to ${member.username}?`,
      confirmLabel: "Send",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    setBusyId(member.id);
    try {
      await add(member.username);
      await showAlert({ title: "Friend Request", message: `Friend request sent to ${member.username}.` });
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) {
        await showAlert({ title: "Friend Request", message: "A friend request is already pending with this user." });
      } else {
        await showAlert({ title: "Friend Request", message: "An error occurred while sending request." });
      }
    } finally {
      setBusyId(null);
    }
  }, [profile, busyId, friendIds, add, showAlert, showConfirm]);

  const ActionComponent = useCallback(
    (props: UserActionProps) => (
      <MemberBalanceAction
        {...props}
        user={props.user as MemberUserItem}
        onMemberClick={handleMemberClick}
        balanceType={balanceType}
      />
    ),
    [handleMemberClick, balanceType]
  );

  const isClickable = Boolean(user && profile);

  return (
    <section className="members-container" aria-label="Table members">
      <header className="members-header">
        <BalanceToggle value={balanceType} onChange={setBalanceType} />
      </header>
      <UserList
        users={memberUsers}
        ActionComponent={isClickable ? ActionComponent : undefined}
        onRowClick={isClickable ? handleMemberClick : undefined}
        emptyMessage="No members in this table."
        disabled={busyId !== null}
        className="members-list-wrapper"
      />
      <footer className="members-footer">
        <p className="balance-description">{BALANCE_DESCRIPTIONS[balanceType]}</p>
      </footer>
      {dialogNode}
    </section>
  );
};
