// client/src/pages/TableView.tsx

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "./TableView.css";
import { useAuth } from "@features/auth";
import { ChatArea } from "@components/Table/ChatArea/ChatArea";
import { MemberList } from "@components/Table/MemberList/memberList";
import { HostControls } from "@components/Table/HostControls/hostControls";
import { TableNavigation, TableNavigationTab } from "@components/Table/TableNavigation/TableNavigation";
import { ModeReference } from "@components/Table/ModeReference/ModeReference";
import BetProposalForm from "@components/Bet/BetProposalForm/BetProposalForm";
import type { BetProposalFormValues } from "@features/bets/hooks/useBetProposalSession";
import { Modal } from "@shared/widgets/Modal/Modal";
import { useTableView } from "@features/table/hooks";
import { useTableChat } from "@features/table/hooks/useTableChat";
import { HttpError } from "@data/clients/restClient";

const RATE_LIMIT_MESSAGE = "You've sent 20 messages and bet proposals in the last minute. Chill out a bit.";

function isRateLimitError(error: unknown): error is HttpError {
  return error instanceof HttpError && error.status === 429;
}

export const TableView: React.FC = () => {
  const { tableId } = useParams<{ tableId: string }>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TableNavigationTab>("chat");
  const [showBetModal, setShowBetModal] = useState(false);
  const [betError, setBetError] = useState<string | null>(null);
  const [showBetErrorModal, setShowBetErrorModal] = useState(false);
  const [showMessageRateLimitModal, setShowMessageRateLimitModal] = useState(false);
  const { table, loading, error, members, isHost } = useTableView(
    tableId,
    user?.id
  );
  const {
    messages: chatFeed,
    sendMessage,
    proposeBet,
    betLoading,
    hasMore: hasMoreMessages,
    loadMore,
    isLoading,
    isLoadingMore,
  } = useTableChat(tableId, user?.id);

  useEffect(() => {
    if (!isHost && activeTab === "controls") {
      setActiveTab("chat");
    }
  }, [isHost, activeTab]);

  const handleProposeBet = () => {
    setBetError(null);
    setShowBetModal(true);
  };
  const handleSendMessageWithRateLimit = useCallback(
    async (message: string) => {
      try {
        await sendMessage(message);
      } catch (err) {
        if (isRateLimitError(err)) {
          setShowMessageRateLimitModal(true);
        }
        throw err;
      }
    },
    [sendMessage]
  );
  const handleBetSubmit = async (form: BetProposalFormValues) => {
    try {
      await proposeBet(form);
      setShowBetModal(false);
      setBetError(null);
      setShowBetErrorModal(false);
    } catch (err) {
      const message = isRateLimitError(err)
        ? RATE_LIMIT_MESSAGE
        : err instanceof Error && err.message
          ? err.message
          : "Failed to create bet proposal.";
      setBetError(message);
      setShowBetModal(false);
      setShowBetErrorModal(true);
    }
  };
  const handleBetCancel = () => setShowBetModal(false);
  const handleBetErrorClose = () => {
    setShowBetErrorModal(false);
    setBetError(null);
  };
  const handleMessageRateLimitClose = () => setShowMessageRateLimitModal(false);

  if (!user)
    return (
      <div className="loading">You must be logged in to view this table.</div>
    );
  if (loading) return <div className="loading">Loading table...</div>;
  if (error) return <div className="loading">{error}</div>;
  if (!table) return <div className="loading">Table not found.</div>;

  return (
    <main className="table-container">
      <TableNavigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isHost={isHost}
      />
      <section
        className="table-content"
        role="tabpanel"
        aria-live="polite"
        id={
          activeTab === "chat"
            ? "chat-panel"
            : activeTab === "members"
            ? "members-panel"
            : activeTab === "controls"
            ? "controls-panel"
            : "modes-panel"
        }
      >
        {activeTab === "chat" && (
          <>
            <ChatArea
              messages={chatFeed}
              currentUserId={user.id}
              onSendMessage={handleSendMessageWithRateLimit}
              onProposeBet={handleProposeBet}
              onLoadMore={loadMore}
              hasMore={hasMoreMessages}
              loading={isLoading}
              loadingMore={isLoadingMore}
              tableName={table.table_name}
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
            <Modal
              isOpen={showBetErrorModal && Boolean(betError)}
              onClose={handleBetErrorClose}
              title="Bet proposal Failed"
            >
              <div className="friends-list-shared empty bet-error-modal-message" role="alert">
                {"Unable to create bet proposal. Either the game has ended or this mode is currently unavailable."}
              </div>
            </Modal>
            <Modal
              isOpen={showMessageRateLimitModal}
              onClose={handleMessageRateLimitClose}
              title={"Knock it off!!"}
            >
              <div className="friends-list-shared empty bet-error-modal-message" role="alert">
                {RATE_LIMIT_MESSAGE}
              </div>
            </Modal>
          </>
        )}
        {activeTab === "members" && (
          <MemberList
            members={members}
          />
        )}
        {activeTab === "modes" && (
          <ModeReference
            enabled={Boolean(user)}
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
