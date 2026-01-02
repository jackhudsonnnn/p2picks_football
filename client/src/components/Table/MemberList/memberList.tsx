import React, { useState, useMemo } from "react";
import "./memberList.css";
import type { TableMember } from "@features/table/types";
import { ProfileIcon } from "@shared/widgets/icons/ProfileIcon/ProfileIcon";
import { formatToHundredth, normalizeToHundredth } from "@shared/utils/number";
import { useAuth } from "@features/auth";
import { useAuthProfile, useFriends } from "@features/social/hooks";
import { useDialog } from "@shared/hooks/useDialog";
import { HttpError } from "@data/clients/restClient";

export type MemberListMember = TableMember;

interface MemberListProps {
  members: MemberListMember[];
}

export const MemberList: React.FC<MemberListProps> = ({ members }) => {
  const { user } = useAuth();
  const { profile } = useAuthProfile();
  const { friends, add } = useFriends(profile?.user_id || undefined);
  const { showAlert, showConfirm, dialogNode } = useDialog();
  const [busyId, setBusyId] = useState<string | null>(null);

  const friendIds = useMemo(() => new Set(friends.map((f) => f.user_id)), [friends]);

  const handleClick = async (member: TableMember) => {
    if (!profile || !profile.user_id) return;
    if (busyId) return;
    if (member.user_id === profile.user_id) {
      await showAlert({ title: "Friend Request", message: "You cant add yourself as a friend!" });
      return;
    }
    if (friendIds.has(member.user_id)) {
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

    setBusyId(member.user_id);
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
  };

  return (
    <section className="members-container" aria-label="Table members">
      <div className="members-list">
        {members.map((member, idx) => {
          const balanceValue = normalizeToHundredth(member.balance);
          const isNegative = balanceValue < 0;
          const isZero = balanceValue === 0;
          const balanceClass = isZero ? " zero" : isNegative ? " negative" : " positive";
          const balanceLabel = formatToHundredth(balanceValue, { showPlus: true });
          const clickable = Boolean(user && profile);
          const isBusy = busyId === member.user_id;

          return (
            <div
              key={member.user_id}
              className={`member-row${idx % 2 === 1 ? " member-row-alt" : ""}${clickable ? " member-row-clickable" : ""}${
                isBusy ? " member-row-busy" : ""
              }`}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : -1}
              onClick={clickable ? () => void handleClick(member) : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void handleClick(member);
                      }
                    }
                  : undefined
              }
            >
              <div className="member-info">
                <ProfileIcon className="member-avatar" name={member.username} ariaLabel={`Avatar for ${member.username}`} />
                <span className="member-name" title={member.username}>
                  <span className="member-username">{member.username}</span>
                </span>
              </div>
              <span className={`member-balance${balanceClass}`} title={`$${balanceLabel}`}>
                <span className="balance-badge">${balanceLabel}</span>
              </span>
            </div>
          );
        })}
      </div>
      {dialogNode}
    </section>
  );
};
