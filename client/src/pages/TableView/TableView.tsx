// client/src/pages/TableView.tsx

import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import "./TableView.css";
import { useAuth } from "@features/auth";
import { getTable, sendTextMessage, subscribeToTableMembers } from "@entities/index";
import { createBetProposal } from "@features/bets/service";
import { ChatArea } from "@widgets/index";
import { MemberList } from "@widgets/Table/MemberList/memberList";
import { HostControls } from "@widgets/Table/HostControls/hostControls";
import { Navigation } from "@widgets/Table/Navigation/Navigation";
import { BetProposalForm } from "@widgets/index";
import type { BetProposalFormValues } from "@widgets/Table/BetProposalForm/BetProposalForm";
import { Modal } from "@shared/ui";
import { useTableFeed } from "@features/bets/hooks/useTableFeed";

export const TableView: React.FC = () => {
  const { tableId } = useParams<{ tableId: string }>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"chat" | "members" | "controls">("chat");
  const [table, setTable] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { messages: chatFeed, refresh: refreshFeed } = useTableFeed(tableId, !!tableId && !!user);
  const [showBetModal, setShowBetModal] = useState(false);
  const [betLoading, setBetLoading] = useState(false);

  // Fetch table data
  useEffect(() => {
    if (!tableId || !user) return;
    setLoading(true);
    setError(null);
    getTable(tableId)
      .then((data) => setTable(data))
      .catch(() => setError("Could not load table. Please try again."))
      .finally(() => setLoading(false));
  }, [tableId, user]);

  // feed handled by hook

  // Realtime: members and feed updates
  useEffect(() => {
    if (!tableId || !user) return;
    // Members: update table members on insert/delete
    const chMembers = subscribeToTableMembers(tableId, async () => {
      try {
        const updated = await getTable(tableId);
        setTable(updated);
      } catch {}
    });
    return () => {
      chMembers.unsubscribe();
    };
  }, [tableId, user]);

  // Send message handler
  const handleSendMessage = async (message: string) => {
    if (!tableId || !user) return;
    try {
      await sendTextMessage(tableId, user.id, message);
  await refreshFeed();
    } catch (e) {
      console.error('sendTextMessage or reload error', e);
    }
  };

  const handleProposeBet = () => {
    setShowBetModal(true);
  };

  const handleBetSubmit = async (form: BetProposalFormValues) => {
    if (!tableId || !user) return;
    setBetLoading(true);
    try {
      await createBetProposal(tableId, user.id, form);
      setShowBetModal(false);
  await refreshFeed();
    } catch (e) {
      console.error('createBetProposal error', e);
    } finally {
      setBetLoading(false);
    }
  };

  const handleBetCancel = () => setShowBetModal(false);

  if (loading) return <div className="loading">Loading table...</div>;
  if (error) return <div className="loading">{error}</div>;
  if (!table) return <div className="loading">Table not found.</div>;
  if (!user) return <div className="loading">You must be logged in to view this table.</div>;

  const members = (table.table_members || []).map((tm: any) => ({
    userId: tm.user_id,
    username: tm.users?.username || tm.user_id,
  }));
  const isHost = table.host_user_id === user.id;

  return (
    <main className="table-container">
      {/* <Header tableName={table.table_name} /> */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        memberCount={members.length}
        isHost={isHost}
      />
      <section className="table-content" aria-live="polite">
        {activeTab === "chat" && (
          <>
            <ChatArea
              messages={chatFeed}
              currentUserId={user.id}
              onSendMessage={handleSendMessage}
              onProposeBet={handleProposeBet}
            />
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