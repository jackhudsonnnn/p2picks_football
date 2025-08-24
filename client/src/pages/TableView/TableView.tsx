// client/src/pages/TableView.tsx

import React, { useState } from "react";
import { useParams } from "react-router-dom";
import "./TableView.css";
import { useAuth } from "@features/auth";
import { ChatArea } from "@/components/index";
import { MemberList } from "@/components/Table/MemberList/memberList";
import { HostControls } from "@/components/Table/HostControls/hostControls";
import { Navigation } from "@/components/Table/Navigation/Navigation";
import { BetProposalForm } from "@/components/index";
import type { BetProposalFormValues } from "@/components/Table/BetProposalForm/BetProposalForm";
import { Modal } from "@shared/widgets";
import { useTableView } from "@features/tables/hooks";
import { useTableFeed } from "@features/bets/hooks/useTableFeed";
import { sendTextMessage } from '@shared/api/tableService';
import { createBetProposal } from "@features/bets/service";

export const TableView: React.FC = () => {
  const { tableId } = useParams<{ tableId: string }>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"chat" | "members" | "controls">("chat");
  const [showBetModal, setShowBetModal] = useState(false);
  const { table, loading, error, members, isHost } = useTableView(tableId, user?.id);
  const { messages: chatFeed, refresh: refreshFeed } = useTableFeed(tableId, Boolean(tableId && user?.id));
  const [betLoading, setBetLoading] = useState(false);

  const handleProposeBet = () => setShowBetModal(true);
  const handleBetSubmit = async (form: BetProposalFormValues) => {
    if (!tableId || !user) return;
    setBetLoading(true);
    try { await createBetProposal(tableId, user.id, form); await refreshFeed(); setShowBetModal(false); }
    finally { setBetLoading(false); }
  };
  const handleBetCancel = () => setShowBetModal(false);

  const sendMessage = async (message: string) => {
    if (!tableId || !user) return;
    await sendTextMessage(tableId, user.id, message);
    await refreshFeed();
  };

  if (!user) return <div className="loading">You must be logged in to view this table.</div>;
  if (loading) return <div className="loading">Loading table...</div>;
  if (error) return <div className="loading">{error}</div>;
  if (!table) return <div className="loading">Table not found.</div>;

  return (
    <main className="table-container">
      {/* <Header tableName={table.table_name} /> */}
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
            <ChatArea messages={chatFeed} currentUserId={user.id} onSendMessage={sendMessage} onProposeBet={handleProposeBet} />
            <Modal isOpen={showBetModal} onClose={handleBetCancel} title="Propose Bet">
              <BetProposalForm onSubmit={handleBetSubmit} loading={betLoading} />
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
        {activeTab === "controls" && tableId && <HostControls tableId={tableId} />}
      </section>
    </main>
  );
};