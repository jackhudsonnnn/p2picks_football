// client/src/pages/PrivateTableView.tsx

import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import "./styles/PrivateTableView.css";
import { useAuth } from "../hooks/useAuth";
import { getPrivateTable, getTableFeed, sendTextMessage } from "../services/tableService";
import { createBetProposal } from "../services/betService";
import { ChatMessage } from "../types/api";
import ChatArea from "../components/privateTable/chat/ChatArea";
import MemberList from "../components/privateTable/memberList";
import HostControls from "../components/privateTable/hostControls";
import Navigation from "../components/privateTable/Navigation";
import BetProposalForm, { BetProposalFormValues } from "../components/privateTable/chat/BetProposalForm";
import Modal from "../components/general/Modal";

export const PrivateTableView: React.FC = () => {
  const { tableId } = useParams<{ tableId: string }>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"chat" | "members" | "controls">("chat");
  const [table, setTable] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatFeed, setChatFeed] = useState<ChatMessage[]>([]);
  const [showBetModal, setShowBetModal] = useState(false);
  const [betLoading, setBetLoading] = useState(false);

  // Fetch table data
  useEffect(() => {
    if (!tableId || !user) return;
    setLoading(true);
    setError(null);
    getPrivateTable(tableId)
      .then((data) => setTable(data))
      .catch(() => setError("Could not load table. Please try again."))
      .finally(() => setLoading(false));
  }, [tableId, user]);

  // Fetch chat feed
  useEffect(() => {
    if (!tableId || !user) return;
    getTableFeed(tableId)
      .then((items: any[]) => {
        const mapped: ChatMessage[] = items
          .filter(item => item.item_type === 'text_message' || item.item_type === 'system_notification' || item.item_type === 'bet_proposal')
          .map(item => {
            if (item.item_type === 'text_message' && item.text_messages) {
              const msg = Array.isArray(item.text_messages) ? item.text_messages[0] : item.text_messages;
              let username = 'Unknown';
              if (msg.users) {
                if (Array.isArray(msg.users)) {
                  username = msg.users[0]?.username || 'Unknown';
                } else {
                  username = (msg.users as any).username || 'Unknown';
                }
              }
              return {
                id: item.feed_item_id,
                type: 'chat',
                senderUserId: msg.user_id,
                senderUsername: username,
                text: msg.message_text,
                timestamp: msg.posted_at,
              } as ChatMessage;
            } else if (item.item_type === 'system_notification' && item.system_notifications) {
              const sys = Array.isArray(item.system_notifications) ? item.system_notifications[0] : item.system_notifications;
              return {
                id: item.feed_item_id,
                type: 'system',
                senderUserId: '',
                senderUsername: '',
                text: sys.message_text,
                timestamp: sys.generated_at,
              } as ChatMessage;
            } else if (item.item_type === 'bet_proposal' && item.bet_proposal) {
              const bet = Array.isArray(item.bet_proposal) ? item.bet_proposal[0] : item.bet_proposal;
              let username = 'Unknown';
              if (bet.users) {
                if (Array.isArray(bet.users)) {
                  username = bet.users[0]?.username || 'Unknown';
                } else {
                  username = (bet.users as any).username || 'Unknown';
                }
              }
              const desc: string = bet.description || (() => {
                if (bet.mode_key === 'best_of_best' && bet.bet_mode_best_of_best) {
                  const cfg = Array.isArray(bet.bet_mode_best_of_best) ? bet.bet_mode_best_of_best[0] : bet.bet_mode_best_of_best;
                  return `Best of the Best • ${cfg?.stat} • ${cfg?.settle_at} — ${cfg?.player1_name ?? 'Player 1'} vs ${cfg?.player2_name ?? 'Player 2'}`;
                } else if (bet.mode_key === 'one_leg_spread') {
                  return `1 Leg Spread`;
                }
                return 'Bet';
              })();
              return {
                id: item.feed_item_id,
                type: 'bet_proposal',
                senderUserId: bet.proposer_user_id,
                senderUsername: username,
                text: desc,
                timestamp: bet.proposal_time,
                betProposalId: bet.bet_id,
                betDetails: {
                  description: desc,
                  wager_amount: bet.wager_amount,
                  time_limit_seconds: bet.time_limit_seconds,
                  winning_condition: bet.winning_condition,
                  bet_status: bet.bet_status,
                  total_pot: bet.total_pot,
                  mode_key: bet.mode_key,
                  nfl_game_id: bet.nfl_game_id,
                },
                tableId: bet.table_id,
              } as ChatMessage;
            }
            return null;
          })
          .filter(Boolean) as ChatMessage[];
        setChatFeed(mapped);
      })
      .catch((e) => {
        console.error('getTableFeed error', e);
        setChatFeed([]);
      });
  }, [tableId, user]);

  // Send message handler
  const handleSendMessage = async (message: string) => {
    if (!tableId || !user) return;
    try {
      await sendTextMessage(tableId, user.id, message);
      // Refresh chat feed after sending
      const items: any[] = await getTableFeed(tableId);
      const mapped: ChatMessage[] = items
        .filter(item => item.item_type === 'text_message' || item.item_type === 'system_notification' || item.item_type === 'bet_proposal')
        .map(item => {
          if (item.item_type === 'text_message' && item.text_messages) {
            const msg = Array.isArray(item.text_messages) ? item.text_messages[0] : item.text_messages;
            let username = 'Unknown';
            if (msg.users) {
              if (Array.isArray(msg.users)) {
                username = msg.users[0]?.username || 'Unknown';
              } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                username = (msg.users as any).username || 'Unknown';
              }
            }
            return {
              id: item.feed_item_id,
              type: 'chat',
              senderUserId: msg.user_id,
              senderUsername: username,
              text: msg.message_text,
              timestamp: msg.posted_at,
            } as ChatMessage;
          } else if (item.item_type === 'system_notification' && item.system_notifications) {
            const sys = Array.isArray(item.system_notifications) ? item.system_notifications[0] : item.system_notifications;
            return {
              id: item.feed_item_id,
              type: 'system',
              senderUserId: '',
              senderUsername: '',
              text: sys.message_text,
              timestamp: sys.generated_at,
            } as ChatMessage;
          } else if (item.item_type === 'bet_proposal' && item.bet_proposal) {
            const bet = Array.isArray(item.bet_proposal) ? item.bet_proposal[0] : item.bet_proposal;
            let username = 'Unknown';
            if (bet.users) {
              if (Array.isArray(bet.users)) {
                username = bet.users[0]?.username || 'Unknown';
              } else {
                username = (bet.users as any).username || 'Unknown';
              }
            }
            const desc: string = bet.description || (() => {
              if (bet.mode_key === 'best_of_best' && bet.bet_mode_best_of_best) {
                const cfg = Array.isArray(bet.bet_mode_best_of_best) ? bet.bet_mode_best_of_best[0] : bet.bet_mode_best_of_best;
                return `Best of the Best • ${cfg?.stat} • ${cfg?.settle_at} — ${cfg?.player1_name ?? 'Player 1'} vs ${cfg?.player2_name ?? 'Player 2'}`;
              } else if (bet.mode_key === 'one_leg_spread') {
                return `1 Leg Spread`;
              }
              return 'Bet';
            })();
            return {
              id: item.feed_item_id,
              type: 'bet_proposal',
              senderUserId: bet.proposer_user_id,
              senderUsername: username,
              text: desc,
              timestamp: bet.proposal_time,
              betProposalId: bet.bet_id,
              betDetails: {
                description: desc,
                wager_amount: bet.wager_amount,
                time_limit_seconds: bet.time_limit_seconds,
                winning_condition: bet.winning_condition,
                bet_status: bet.bet_status,
                total_pot: bet.total_pot,
                mode_key: bet.mode_key,
                nfl_game_id: bet.nfl_game_id,
              },
              tableId: bet.table_id,
            } as ChatMessage;
          }
          return null;
        })
        .filter(Boolean) as ChatMessage[];
      setChatFeed(mapped);
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
      const items: any[] = await getTableFeed(tableId);
      const mapped: ChatMessage[] = items
        .filter(item => item.item_type === 'text_message' || item.item_type === 'system_notification' || item.item_type === 'bet_proposal')
        .map(item => {
          if (item.item_type === 'text_message' && item.text_messages) {
            const msg = Array.isArray(item.text_messages) ? item.text_messages[0] : item.text_messages;
            let username = 'Unknown';
            if (msg.users) {
              if (Array.isArray(msg.users)) {
                username = msg.users[0]?.username || 'Unknown';
              } else {
                username = (msg.users as any).username || 'Unknown';
              }
            }
            return {
              id: item.feed_item_id,
              type: 'chat',
              senderUserId: msg.user_id,
              senderUsername: username,
              text: msg.message_text,
              timestamp: msg.posted_at,
            } as ChatMessage;
          } else if (item.item_type === 'system_notification' && item.system_notifications) {
            const sys = Array.isArray(item.system_notifications) ? item.system_notifications[0] : item.system_notifications;
            return {
              id: item.feed_item_id,
              type: 'system',
              senderUserId: '',
              senderUsername: '',
              text: sys.message_text,
              timestamp: sys.generated_at,
            } as ChatMessage;
          } else if (item.item_type === 'bet_proposal' && item.bet_proposal) {
            const bet = Array.isArray(item.bet_proposal) ? item.bet_proposal[0] : item.bet_proposal;
            let username = 'Unknown';
            if (bet.users) {
              if (Array.isArray(bet.users)) {
                username = bet.users[0]?.username || 'Unknown';
              } else {
                username = (bet.users as any).username || 'Unknown';
              }
            }
            const desc: string = bet.description || (() => {
              if (bet.mode_key === 'best_of_best' && bet.bet_mode_best_of_best) {
                const cfg = Array.isArray(bet.bet_mode_best_of_best) ? bet.bet_mode_best_of_best[0] : bet.bet_mode_best_of_best;
                return `Best of the Best • ${cfg?.stat} • ${cfg?.settle_at} — ${cfg?.player1_name ?? 'Player 1'} vs ${cfg?.player2_name ?? 'Player 2'}`;
              } else if (bet.mode_key === 'one_leg_spread') {
                return `1 Leg Spread`;
              }
              return 'Bet';
            })();
            return {
              id: item.feed_item_id,
              type: 'bet_proposal',
              senderUserId: bet.proposer_user_id,
              senderUsername: username,
              text: desc,
              timestamp: bet.proposal_time,
              betProposalId: bet.bet_id,
              betDetails: {
                description: desc,
                wager_amount: bet.wager_amount,
                time_limit_seconds: bet.time_limit_seconds,
                winning_condition: bet.winning_condition,
                bet_status: bet.bet_status,
                total_pot: bet.total_pot,
                mode_key: bet.mode_key,
                nfl_game_id: bet.nfl_game_id,
              },
              tableId: bet.table_id,
            } as ChatMessage;
          }
          return null;
        })
        .filter(Boolean) as ChatMessage[];
      setChatFeed(mapped);
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
    balance: (tm.balance_cents / 100).toFixed(2),
  }));
  const isHost = table.host_user_id === user.id;

  return (
    <main className="private-table-container">
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