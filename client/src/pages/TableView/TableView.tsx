// client/src/pages/TableView.tsx

import React, { useState } from "react";
import { useParams } from "react-router-dom";
import "./TableView.css";
import { useAuth } from "@features/auth";
import { ChatArea } from "@components/Table/ChatArea/ChatArea";
import { MemberList } from "@components/Table/MemberList/memberList";
import { HostControls } from "@components/Table/HostControls/hostControls";
import { Navigation } from "@components/Table/Navigation/Navigation";
import BetProposalForm from "@components/Bet/BetProposalForm/BetProposalForm";
import type { BetProposalFormValues } from "@components/Bet/BetProposalForm/BetProposalForm";
import { Modal } from "@shared/widgets";
import { useTableView } from "@features/tables/hooks";
import { useTableChat } from "@features/tables/hooks/useTableChat";

export const TableView: React.FC = () => {
  const { tableId } = useParams<{ tableId: string }>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"chat" | "members" | "controls">(
    "chat"
  );
  const [showBetModal, setShowBetModal] = useState(false);
  const { table, loading, error, members, isHost } = useTableView(
    tableId,
    user?.id
  );
  const { messages: chatFeed, sendMessage, proposeBet, betLoading } = useTableChat(tableId, user?.id);

  const handleProposeBet = () => setShowBetModal(true);
  const handleBetSubmit = async (form: BetProposalFormValues) => {
    await proposeBet(form);
    setShowBetModal(false);
  };
  const handleBetCancel = () => setShowBetModal(false);

  if (!user)
    return (
      <div className="loading">You must be logged in to view this table.</div>
    );
  if (loading) return <div className="loading">Loading table...</div>;
  if (error) return <div className="loading">{error}</div>;
  if (!table) return <div className="loading">Table not found.</div>;

  return (
    <main className="table-container">
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        memberCount={members.length}
        isHost={isHost}
        tableName={table.table_name}
      />
      <section className="table-content" aria-live="polite">
        {activeTab === "chat" && (
          <>
            <ChatArea
              messages={chatFeed}
              currentUserId={user.id}
              onSendMessage={sendMessage}
              onProposeBet={handleProposeBet}
            />
            <Modal
              isOpen={showBetModal}
              onClose={handleBetCancel}
              title="Propose Bet"
            >
              <BetProposalForm
                onSubmit={handleBetSubmit}
                loading={betLoading}
              />
            </Modal>
          </>
        )}
        {activeTab === "members" && (
          <MemberList
            members={members}
            hostUserId={table.host_user_id}
            currentUserId={user.id}
          />
        )}
        {activeTab === "controls" && tableId && (
          <HostControls
            tableId={tableId}
            members={members}
            currentUserId={user.id}
          />
        )}
      </section>
    </main>
  );
};
