// filepath: /home/jhudson/projects/test1/p2picks/client/src/pages/TablesListPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@features/auth";
import { createTable, getUserTables, getUsernamesByIds } from "@entities/index";
import "./TablesListPage.css";

// Import generalized components
import { Card, SearchBar, FilterBar, type FilterOption, PageHeader, Modal } from "@shared/ui";

// Table interface for Supabase
interface SupabaseTable {
  table_id: string;
  table_name: string;
  host_user_id: string;
  created_at: string;
  last_activity_at: string;
  host_username?: string; 
}

export const TablesListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [allTables, setAllTables] = useState<SupabaseTable[]>([]);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const tablesPerPage = 6;
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTableName, setNewTableName] = useState("");

  // Fetch tables from Supabase
  useEffect(() => {
    if (!user) return;
    getUserTables(user.id)
      .then(async (tables) => {
        const hostIds = Array.from(new Set(tables.map(t => t.host_user_id)));
        const idToUsername = await getUsernamesByIds(hostIds);
        const tablesWithUsernames = tables.map(t => ({
          ...t,
          host_username: idToUsername[t.host_user_id] || t.host_user_id
        }));
        setAllTables(tablesWithUsernames);
      })
      .catch((err) => {
        console.error("Error fetching tables:", err);
        setAllTables([]);
      });
  }, [user]);

  // Format date function
  const formatDate = (dateString: string): string => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Create table function (Supabase)
  const handleCreateTable = async () => {
    if (!newTableName.trim()) {
      alert("Please enter a table name");
      return;
    }
    if (!user) {
      alert("You must be logged in to create a table.");
      return;
    }
    try {
      const table = await createTable(newTableName, user.id);
      setAllTables([table, ...allTables]);
      setIsCreateModalOpen(false);
      setNewTableName("");
      navigate(`/tables/${table.table_id}`);
    } catch (err: any) {
      alert("Failed to create table: " + (err.message || err));
    }
  };

  // Filter tables based on search query
  const filteredTables = allTables.filter((table) => {
    const searchMatch =
      searchQuery === "" ||
      table.table_name.toLowerCase().includes(searchQuery.toLowerCase());
    return searchMatch;
  });

  // Pagination and counts
  const indexOfLastTable = currentPage * tablesPerPage;
  const indexOfFirstTable = indexOfLastTable - tablesPerPage;
  const currentTables = filteredTables.slice(indexOfFirstTable, indexOfLastTable);
  const totalPages = Math.ceil(filteredTables.length / tablesPerPage);

  // Filter options (only 'all' for now, since no category)
  const filterOptions: FilterOption[] = [
    { id: "all", label: "All Tables", count: allTables.length },
  ];

  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter);
    setCurrentPage(1);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // Card rendering functions
  const renderTableHeader = (table: SupabaseTable) => (
    <>
      <div className="table-header-left">
        <span className="table-name">{table.table_name}</span>
        <span className="table-host">
          Hosted by {table.host_username || table.host_user_id}
        </span>
      </div>
      <div className="table-header-right">
        <span className="activity-label">Last activity</span>
        <span className="activity-time">
          {formatDate(table.last_activity_at)}
        </span>
      </div>
    </>
  );

  const renderTableContent = () => <></>;

  const renderTableActions = (table: SupabaseTable) => (
    <div className="table-actions">
        <span className="activity-label">Created</span>
        <span className="activity-time">{formatDate(table.created_at)}</span>
    </div>
  );

  const renderTableFooterLeft = () => (
    <div className="table-activity">
      <span className="members-count">members</span>
    </div>
  );

  const renderTableFooterRight = (table: SupabaseTable) => (
    <button
      className="view-table-btn"
      onClick={() => navigate(`/tables/${table.table_id}`)}
    >
      View Table →
    </button>
  );

  // Create button component
  const CreateTableButton = (
    <button className="create-button" onClick={() => setIsCreateModalOpen(true)}>
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      Create Table
    </button>
  );

  return (
    <div className="tables-list-page">
      {/* Page Header with Create Button */}
      <PageHeader
        title="My Tables"
        actionButton={CreateTableButton}
      />

      {/* Create Table Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Table"
        footer={
          <>
            <button 
              className="btn btn-secondary" 
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </button>
            <button 
              className="btn btn-primary" 
              onClick={handleCreateTable}
            >
              Create
            </button>
          </>
        }
      >
        <div className="form-group">
          <label htmlFor="tableName">Table Name</label>
          <input
            type="text"
            id="tableName"
            className="form-control"
            value={newTableName}
            onChange={(e) => setNewTableName(e.target.value)}
            placeholder="Enter table name"
            autoFocus
          />
        </div>
      </Modal>

      {/* Filter Bar */}
      <FilterBar
        selectedFilter={filter}
        onFilterChange={handleFilterChange}
        options={filterOptions}
      />

      {/* Search Bar */}
      <SearchBar
        value={searchQuery}
        onChange={handleSearchChange}
        placeholder="Search tables..."
      />

      {/* Tables List */}
      {filteredTables.length > 0 ? (
        <div className="tables-list">
          {currentTables.map((table) => (
            <Card
              key={table.table_id}
              data={table}
              renderHeader={() => renderTableHeader(table)}
              renderContent={() => renderTableContent()}
              renderActions={() => renderTableActions(table)}
              renderFooterLeft={() => renderTableFooterLeft()}
              renderFooterRight={() => renderTableFooterRight(table)}
              stateClass="table-card"
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>No tables match your filter criteria.</p>
        </div>
      )}

      {/* Pagination */}
      {filteredTables.length > tablesPerPage && (
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