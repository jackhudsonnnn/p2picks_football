import { useMemo, useState } from "react";
import "./TicketsPage.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@features/auth";
import TicketCard from "@components/Bet/TicketCard/TicketCard";
import { FilterBar, PaginationControls } from "@shared/widgets";
import { useTickets } from "@features/bets/hooks/useTickets";
import { useIsMobile } from "@shared/hooks/useIsMobile";
import { useDialog } from "@shared/hooks/useDialog";

const STATUS_FILTER_OPTIONS = [
  { id: "active", label: "Active" },
  { id: "pending", label: "Pending" },
  { id: "resolved", label: "Resolved" },
  { id: "washed", label: "Washed" },
];

export const TicketsPage: React.FC = () => {
  const { user } = useAuth();
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const ticketsPerPage = 6;
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { tickets, loading, changeGuess } = useTickets(user?.id);
  const { showAlert, dialogNode } = useDialog();

  const handleGuessChange = async (ticketId: string, newGuess: string) => {
    try {
      await changeGuess(ticketId, newGuess);
    } catch (e: any) {
      if (e && e.code === "PGRST116") {
        await showAlert({
          title: "Update Guess",
          message: "Guesses can no longer be changed for this ticket.",
        });
        return;
      }
      const message = `Failed to update your guess. ${e?.code ?? ''}`.trim();
      await showAlert({ title: "Update Guess", message });
    }
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

  const handleFilterChange = (nextFilters: string[]) => {
    setSelectedStatuses(nextFilters);
    setCurrentPage(1);
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const filteredTickets = useMemo(() => {
    const effectiveStatuses = selectedStatuses.length
      ? selectedStatuses
      : STATUS_FILTER_OPTIONS.map((option) => option.id);

    if (effectiveStatuses.length === STATUS_FILTER_OPTIONS.length) {
      return tickets;
    }

    const statusSet = new Set(effectiveStatuses);
    return tickets.filter((ticket) => statusSet.has(ticket.state));
  }, [selectedStatuses, tickets]);

  const indexOfLastTicket = currentPage * ticketsPerPage;
  const indexOfFirstTicket = indexOfLastTicket - ticketsPerPage;
  const currentTickets = filteredTickets.slice(
    indexOfFirstTicket,
    indexOfLastTicket
  );
  const totalPages = Math.ceil(filteredTickets.length / ticketsPerPage);
  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <div className={`tickets-page ${isMobile ? 'mobile' : ''}`}>
      <div className="page-header">
        <div className="page-title"><h1>Tickets</h1></div>
        <FilterBar
          options={STATUS_FILTER_OPTIONS}
          selectedFilters={selectedStatuses}
          onFilterChange={handleFilterChange}
          className="tickets-filter-dropdown"
          placeholder="All statuses"
        />
      </div>

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
          <p>No tickets match your selected filters.</p>
        </div>
      )}

      {filteredTickets.length > ticketsPerPage && (
        <PaginationControls
          className="tickets-pagination"
          current={currentPage}
          total={totalPages}
          onPrevious={() => handlePageChange(Math.max(currentPage - 1, 1))}
          onNext={() => handlePageChange(Math.min(currentPage + 1, totalPages))}
          disablePrevious={currentPage === 1}
          disableNext={currentPage === totalPages}
        />
      )}
      </div>
      {dialogNode}
    </>
  );
};
