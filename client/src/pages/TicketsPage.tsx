import { useState, useEffect } from "react";
import "./styles/TicketsPage.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getUserTickets } from "../services/betService";
import { supabase } from "../services/supabaseClient";

// Import generalized components
import Card from "../components/cards/Card";
import SearchBar from "../components/general/SearchBar";
import FilterBar, { FilterOption } from "../components/general/Filter";
import PageHeader from "../components/general/Header";

// Ticket-specific interfaces
interface Ticket {
  id: string;
  tableId: string;
  tableName: string;
  createdAt: string;
  closedAt: string | null;
  state: string;
  gameContext: string;
  betDetails: string;
  myGuess: string;
  wager: number;
  payout: number;
  result: string | null;
  settledStatus: boolean;
  // Add for timer logic
  proposalTime?: string;
  timeLimitSeconds?: number;
  // Mode-aware fields
  modeKey?: string;
  player1Name?: string;
  player2Name?: string;
  stat?: string;
  settleAt?: string;
}

// Hook to detect mobile screen
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);

    return () => window.removeEventListener("resize", checkIsMobile);
  }, []);

  return isMobile;
};

export const TicketsPage = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ticketsPerPage = 6;
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());

  // Update 'now' every second to trigger live countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch tickets from Supabase
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getUserTickets(user.id)
      .then((data) => {
        const mapped = (data || []).map((row: any) => {
          const bet = row.bet_proposals;
          // Description
          const description = bet?.description || (() => {
            if (bet?.mode_key === 'best_of_best' && bet?.bet_mode_best_of_best) {
              const cfg = Array.isArray(bet.bet_mode_best_of_best) ? bet.bet_mode_best_of_best[0] : bet.bet_mode_best_of_best;
              return `Best of the Best • ${cfg?.stat} • ${cfg?.settle_at}`;
            } else if (bet?.mode_key === 'one_leg_spread') {
              return `1 Leg Spread`;
            }
            return 'Bet';
          })();
          const cfg = bet?.bet_mode_best_of_best
            ? (Array.isArray(bet.bet_mode_best_of_best) ? bet.bet_mode_best_of_best[0] : bet.bet_mode_best_of_best)
            : undefined;
          return {
            id: row.participation_id,
            tableId: row.table_id,
            tableName: bet?.private_tables?.table_name || '',
            createdAt: bet?.proposal_time || row.participation_time,
            closedAt: null,
            state: 'active',
            gameContext: description,
            betDetails: description,
            myGuess: row.user_guess || 'pass',
            wager: bet?.wager_amount || 0,
            payout: bet?.wager_amount ? bet.wager_amount * 2 : 0,
            result: null,
            settledStatus: false,
            proposalTime: bet?.proposal_time,
            timeLimitSeconds: bet?.time_limit_seconds,
            modeKey: bet?.mode_key,
            player1Name: cfg?.player1_name,
            player2Name: cfg?.player2_name,
            stat: cfg?.stat,
            settleAt: cfg?.settle_at,
          } as Ticket;
        });
        setTickets(mapped);
      })
      .finally(() => setLoading(false));
  }, [user]);

  const handleGuessChange = async (ticketId: string, newGuess: string) => {
    // Update in Supabase
    try {
      const { data: updated, error } = await supabase
        .from('bet_participations')
        .update({ user_guess: newGuess })
        .eq('participation_id', ticketId)
        // Also scope by user to satisfy RLS and ensure a single row
        .eq('user_id', user?.id || '')
        // Request the updated row back; required when chaining .single()
        .select('participation_id, user_guess')
        .single();
      if (error) {
        console.error('Update guess failed:', error);
        alert(`Failed to update your guess. ${error.message ?? ''}`.trim());
        return;
      }
      // Optionally update local state optimistically if needed
      if (updated) {
        setTickets((prev) => prev.map(t => t.id === updated.participation_id ? { ...t, myGuess: updated.user_guess } : t));
      }
      // Re-fetch tickets to ensure latest participation is shown
      if (user) {
        setLoading(true);
        getUserTickets(user.id)
          .then((data) => {
            const mapped = (data || []).map((row: any) => {
              const bet = row.bet_proposals;
              let description = '';
              if (bet?.mode_key === 'best_of_best' && bet?.bet_mode_best_of_best) {
                const cfg = Array.isArray(bet.bet_mode_best_of_best) ? bet.bet_mode_best_of_best[0] : bet.bet_mode_best_of_best;
                description = `Best of the Best • ${cfg?.stat} • ${cfg?.settle_at}`;
              } else if (bet?.mode_key === 'one_leg_spread') {
                description = `1 Leg Spread`;
              } else {
                description = bet ? `${bet.entity1_name} ${bet.entity1_proposition} __ ${bet.entity2_name} ${bet.entity2_proposition}` : '';
              }
              return {
                id: row.participation_id,
                tableId: row.table_id,
                tableName: bet?.private_tables?.table_name || '',
                createdAt: bet?.proposal_time || row.participation_time,
                closedAt: null,
                state: 'active',
                gameContext: bet ? `${bet.entity1_name} vs. ${bet.entity2_name}` : '',
                betDetails: description,
                myGuess: row.user_guess || 'pass',
                wager: bet?.wager_amount || 0,
                payout: bet?.wager_amount ? bet.wager_amount * 2 : 0,
                result: null,
                settledStatus: false,
                proposalTime: bet?.proposal_time,
                timeLimitSeconds: bet?.time_limit_seconds,
                modeKey: bet?.mode_key,
                player1Name: bet?.entity1_name,
                player2Name: bet?.entity2_name,
                stat: Array.isArray(bet?.bet_mode_best_of_best) ? bet?.bet_mode_best_of_best?.[0]?.stat : bet?.bet_mode_best_of_best?.stat,
                settleAt: Array.isArray(bet?.bet_mode_best_of_best) ? bet?.bet_mode_best_of_best?.[0]?.settle_at : bet?.bet_mode_best_of_best?.settle_at,
              } as Ticket;
            });
            setTickets(mapped);
          })
          .finally(() => setLoading(false));
      }
    } catch (e) {
      alert('Failed to update your guess. Please try again.');
    }
  };

  const handleEnterTable = (tableId: string) => {
    navigate(`/private-tables/${tableId}`);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const filteredTickets = tickets.filter((ticket) => {
    const stateMatch =
      filter === "all" || ticket.state.toLowerCase() === filter.toLowerCase();
    const searchMatch =
      searchQuery === "" ||
      ticket.tableName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.gameContext.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.betDetails.toLowerCase().includes(searchQuery.toLowerCase());
    return stateMatch && searchMatch;
  });

  const indexOfLastTicket = currentPage * ticketsPerPage;
  const indexOfFirstTicket = indexOfLastTicket - ticketsPerPage;
  const currentTickets = filteredTickets.slice(
    indexOfFirstTicket,
    indexOfLastTicket
  );
  const totalPages = Math.ceil(filteredTickets.length / ticketsPerPage);

  const ticketCounts = {
    total: tickets.length,
    active: tickets.length, 
    pending: 0,
    settled: 0,
    wins: 0,
  };

  const filterOptions: FilterOption[] = [
    { id: "all", label: "All", count: ticketCounts.total },
    { id: "active", label: "active", count: ticketCounts.active },
  ];

  // Format functions for tickets
  const formatDate = (dateString: string): string => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderTicketHeader = (ticket: Ticket) => {
    // Timer logic for status badge
    let timeLeft = 0;
    let isPending = false;
    if (ticket.proposalTime && ticket.timeLimitSeconds) {
      const proposal = new Date(ticket.proposalTime).getTime();
      timeLeft = Math.max(0, ticket.timeLimitSeconds - (now - proposal) / 1000);
      isPending = timeLeft <= 0;
    } else {
      isPending = true;
    }
    // Show 'Pending' in badge if timer expired
    const displayState = isPending ? 'Pending' : ticket.state;
    return (
      <>
        <div className="ticket-header-left">
          <span className="bet-details">{ticket.betDetails}</span>
          <span className="ticket-date">{formatDate(ticket.createdAt)}</span>
        </div>
        <div className="ticket-header-right">
          <span className={`ticket-status status-${displayState.toLowerCase()}`}>
            {displayState}
          </span>
          <span className="ticket-type">{ticket.tableName}</span>
        </div>
      </>
    );
  };

  const renderTicketContent = (ticket: Ticket) => (
    <>
      <span className="game-context">{ticket.gameContext}</span>
    </>
  );

  // New footer left render function with bet options for active tickets
  const renderFooterLeft = (ticket: Ticket) => {
    // Function to handle guess change via dropdown
    const handleGuessChangeDropdown = (ticketId: string, newGuess: string) => {
      if (ticket.myGuess !== newGuess) {
        if (
          window.confirm(
            `Are you sure you want to change your guess to ${newGuess}?`
          )
        ) {
          handleGuessChange(ticketId, newGuess);
        }
      }
    };
    // Timer logic: calculate time left for this ticket using 'now'
    let timeLeft = 0;
    let isPending = false;
    if (ticket.proposalTime && ticket.timeLimitSeconds) {
      const proposal = new Date(ticket.proposalTime).getTime();
      timeLeft = Math.max(0, ticket.timeLimitSeconds - (now - proposal) / 1000);
      isPending = timeLeft <= 0;
    } else {
      isPending = true;
    }
    const timerDisplay = isPending
      ? "0.0s"
      : timeLeft !== undefined
      ? `${timeLeft.toFixed(1)}s`
      : "--";
    if (ticket.state === "active") {
      return (
        <div className="ticket-bet-options">
          <div className="mobile-bet-container">
            <select
              className="mobile-bet-dropdown"
              value={ticket.myGuess}
              onChange={(e) => handleGuessChangeDropdown(ticket.id, e.target.value)}
              disabled={isPending}
            >
              {ticket.modeKey === 'best_of_best' ? (
                <>
                  <option value="pass">pass</option>
                  {ticket.player1Name && <option value={ticket.player1Name}>{ticket.player1Name}</option>}
                  {ticket.player2Name && <option value={ticket.player2Name}>{ticket.player2Name}</option>}
                </>
              ) : ticket.modeKey === 'one_leg_spread' ? (
                <>
                  <option value="pass">pass</option>
                  <option value="0-3">0-3</option>
                  <option value="4-10">4-10</option>
                  <option value="11-25">11-25</option>
                  <option value="26+">26+</option>
                </>
              ) : (
                <>
                  <option value="pass">pass</option>
                </>
              )}
            </select>
            <div className="bet-timer">{timerDisplay}</div>
          </div>
        </div>
      );
    } else if (ticket.state === "Pending") {
      return (
        <div className="ticket-guess-info">
          <span className="guess-label">Your pick: </span>
          <span className="guess-value"> { ticket.myGuess}</span>
        </div>
      );
    } else {
      return (
        <div className="ticket-results-info">
          <div className="guess-row">
            <span className="guess-label">Your pick: </span>
            <span className="guess-value">{ticket.myGuess}</span>
            <span className="guess-label"> | Result: </span>
            <span className="guess-value">
              {ticket.result ? ticket.result : "N/A"}
            </span>
          </div>
        </div>
      );
    }
  };

  // Footer right render function
  const renderFooterRight = (ticket: Ticket) => (
    <button
      className="enter-table-btn"
      onClick={() => handleEnterTable(ticket.tableId)}
    >
      View Table →
    </button>
  );

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className={`tickets-page ${isMobile ? 'mobile' : ''}`}>
      {/* Use the generalized PageHeader */}
      <PageHeader
        title="My Tickets"
        stats={[
          { value: ticketCounts.total, label: "Total Tickets" },
          { value: ticketCounts.wins, label: "Total Wins" },
        ]}
      />

      {/* Use the generalized FilterBar */}
      <FilterBar
        selectedFilter={filter}
        onFilterChange={setFilter}
        options={filterOptions}
      />

      {/* Use the generalized SearchBar */}
      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search tickets..."
      />

      {filteredTickets.length > 0 ? (
        <div className="tickets-list">
          {currentTickets.map((ticket) => (
            <Card
              key={ticket.id}
              data={ticket}
              renderHeader={() => renderTicketHeader(ticket)}
              renderContent={() => renderTicketContent(ticket)}
              renderActions={undefined}
              renderFooterLeft={() => renderFooterLeft(ticket)}
              renderFooterRight={() => renderFooterRight(ticket)}
              stateClass={ticket.state.toLowerCase()}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>No tickets match your filter criteria.</p>
        </div>
      )}

      {filteredTickets.length > ticketsPerPage && (
        <div className="pagination-controls">
          <button
            className="pagination-button"
            onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <span className="pagination-info">
            {currentPage} of {totalPages}
          </span>
          <button
            className="pagination-button"
            onClick={() =>
              handlePageChange(Math.min(currentPage + 1, totalPages))
            }
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};
