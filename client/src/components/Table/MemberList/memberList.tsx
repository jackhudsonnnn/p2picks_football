import React from "react";
import "./memberList.css";
import type { TableMember } from "@features/table/types";
import { formatToHundredth, normalizeToHundredth } from "@shared/utils/number";

export type MemberListMember = TableMember;

interface MemberListProps {
  members: MemberListMember[];
}

const getInitials = (name: string) => {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "?";
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

export const MemberList: React.FC<MemberListProps> = ({ members }) => (
  <section className="members-container" aria-label="Table members">
    <div className="members-list">
      <header className="members-header">
        <span className="member-name-header">Member</span>
        <span className="member-balance-header">Balance</span>
      </header>
      {members.map((member, idx) => {
        const balanceValue = normalizeToHundredth(member.balance);
        const isNegative = balanceValue < 0;
        const isZero = balanceValue === 0;
        const balanceClass = isZero ? " zero" : isNegative ? " negative" : " positive";
        const balanceLabel = formatToHundredth(balanceValue, { showPlus: true });

        return (
          <div key={member.user_id} className={`member-row${idx % 2 === 1 ? " member-row-alt" : ""}`}>
            <div className="member-info">
              <span className="member-avatar" aria-hidden="true">{getInitials(member.username)}</span>
              <span className="member-name" title={member.username}>
                <span className="member-username">{member.username}</span>
              </span>
            </div>
            <span className={`member-balance${balanceClass}`} title={`${balanceLabel} pts`}>
              <span className="balance-badge">{balanceLabel} pts</span>
            </span>
          </div>
        );
      })}
    </div>
  </section>
);
