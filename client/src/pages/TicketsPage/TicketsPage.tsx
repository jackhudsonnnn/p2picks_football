import { useState } from "react";
import "./TicketsPage.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@features/auth";
import TicketCard from "@features/bets/ui/TicketCard";
import { SearchBar, FilterBar, type FilterOption, PageHeader } from "@shared/widgets";
import { useTickets } from "@features/bets/hooks/useTickets";
import { useIsMobile } from "@shared/hooks/useIsMobile";

export const TicketsPage: React.FC = () => {
  const { user } = useAuth();
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ticketsPerPage = 6;
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { tickets, loading, counts, changeGuess } = useTickets(user?.id);

  const handleGuessChange = async (ticketId: string, newGuess: string) => {
    try { await changeGuess(ticketId, newGuess); } catch (e: any) { alert(`Failed to update your guess. ${e?.message ?? ''}`.trim()); }
  };

  const handleEnterTable = (tableId: string) => {
    navigate(`/tables/${tableId}`);
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

  const ticketCounts = counts;

  const filterOptions: FilterOption[] = [
    { id: "all", label: "All", count: ticketCounts.total },
    { id: "active", label: "active", count: ticketCounts.active },
  ];

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
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onChangeGuess={handleGuessChange}
              onEnterTable={handleEnterTable}
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
