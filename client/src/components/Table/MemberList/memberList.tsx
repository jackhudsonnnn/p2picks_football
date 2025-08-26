import React from "react";
import "./memberList.css";
import type { TableMember } from "@features/tables/types";

export interface MemberListMember extends TableMember {
  balance?: number; // extend with numeric balance (no string)
}

interface MemberListProps {
  members: MemberListMember[];
  hostUserId: string;
  currentUserId: string;
}

const getInitials = (name: string) => {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "?";
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

export const MemberList: React.FC<MemberListProps> = ({ members, hostUserId, currentUserId }) => (
  <section className="members-container" aria-label="Table members">
    <div className="members-list">
      <header className="members-header">
        <span className="member-name-header">Member</span>
        <span className="member-balance-header">Balance</span>
      </header>
      {members.map((member, idx) => (
        <div key={member.user_id} className={`member-row${idx % 2 === 1 ? " member-row-alt" : ""}`}>
          <div className="member-info">
            <span className="member-avatar" aria-hidden="true">{getInitials(member.username)}</span>
            <span className="member-name" title={member.username}>
              <span className="member-username">{member.username}</span>
              {member.user_id === hostUserId && (
                <span className="host-badge" title="Host" aria-label="Host">
                  <svg width="13" height="13" viewBox="0 0 16 16" className="badge-icon" aria-hidden="true"><path fill="currentColor" d="M8 2l1.76 3.57L14 6.18l-2.5 2.44.59 3.44L8 10.77l-3.09 1.29.59-3.44L3 6.18l4.24-.61z"/></svg>
                </span>
              )}
              {member.user_id === currentUserId && (
                <span className="you-badge" title="You" aria-label="You">
                  <svg width="13" height="13" viewBox="0 0 16 16" className="badge-icon" aria-hidden="true">
                    <circle cx="8" cy="6" r="3" fill="currentColor" />
                    <path fill="currentColor" d="M2 14c0-2.21 2.91-4 6-4s6 1.79 6 4" />
                  </svg>
                </span>
              )}
            </span>
          </div>
          <span className={`member-balance${(member.balance ?? 0) < 0 ? " negative" : " positive"}`} title={`${member.balance ?? 0} pts`}>
            <span className="balance-badge">{(member.balance ?? 0) >= 0 ? "+" : ""}{member.balance ?? 0} pts</span>
          </span>
        </div>
      ))}
    </div>
  </section>
);
