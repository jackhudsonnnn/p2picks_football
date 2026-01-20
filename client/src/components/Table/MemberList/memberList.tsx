import React, { useState, useMemo, useCallback } from "react";
import "./memberList.css";
import type { TableMember } from "@features/table/types";
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

// Extended user item to include balance
interface MemberUserItem extends UserItem {
  balance: number;
}

interface MemberBalanceActionProps extends UserActionProps {
  user: MemberUserItem;
  onMemberClick: (member: MemberUserItem) => void;
}

const MemberBalanceAction: React.FC<MemberBalanceActionProps> = ({ user, disabled, onMemberClick }) => {
  const balanceValue = normalizeToHundredth(user.balance);
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
      aria-label={`Balance for ${user.username}: ${balanceLabel}. Click to send friend request.`}
      aria-disabled={disabled}
      title={balanceLabel}
    >
      <span className="balance-badge">{balanceLabel}</span>
    </div>
  );
};

export const MemberList: React.FC<MemberListProps> = ({ members }) => {
  const { user } = useAuth();
  const { profile } = useAuthProfile();
  const { friends, add } = useFriends(profile?.user_id || undefined);
  const { showAlert, showConfirm, dialogNode } = useDialog();
  const [busyId, setBusyId] = useState<string | null>(null);

  const friendIds = useMemo(() => new Set(friends.map((f) => f.user_id)), [friends]);

  const memberUsers: MemberUserItem[] = useMemo(
    () => members.map((m) => ({
      id: m.user_id,
      username: m.username,
      balance: m.balance,
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
      />
    ),
    [handleMemberClick]
  );

  const isClickable = Boolean(user && profile);

  return (
    <section className="members-container" aria-label="Table members">
      <UserList
        users={memberUsers}
        ActionComponent={isClickable ? ActionComponent : undefined}
        onRowClick={isClickable ? handleMemberClick : undefined}
        emptyMessage="No members in this table."
        disabled={busyId !== null}
        className="members-list-wrapper"
      />
      {dialogNode}
    </section>
  );
};
