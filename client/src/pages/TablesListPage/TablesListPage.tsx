// filepath: /home/jhudson/projects/test1/p2picks/client/src/pages/TablesListPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@features/auth";
import "./TablesListPage.css";
import { Card, SearchBar, FilterBar, type FilterOption, PageHeader, Modal } from "@shared/ui";
import { useTablesList } from "@features/tables/hooks";

export const TablesListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const tablesPerPage = 6;
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTableName, setNewTableName] = useState("");

  const { tables, create, loading } = useTablesList(user?.id);

  const filteredTables = tables.filter((table) =>
    searchQuery === "" || table.table_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const indexOfLastTable = currentPage * tablesPerPage;
  const indexOfFirstTable = indexOfLastTable - tablesPerPage;
  const currentTables = filteredTables.slice(indexOfFirstTable, indexOfLastTable);
  const totalPages = Math.ceil(filteredTables.length / tablesPerPage);

  const filterOptions: FilterOption[] = [
    { id: "all", label: "All Tables", count: tables.length },
  ];

  const handleCreateTable = async () => {
    if (!newTableName.trim()) return alert("Please enter a table name");
    if (!user) return alert("You must be logged in to create a table.");
    try {
      const table = await create(newTableName);
      setIsCreateModalOpen(false);
      setNewTableName("");
      navigate(`/tables/${table.table_id}`);
    } catch (e: any) {
      alert("Failed to create table: " + (e?.message || e));
    }
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="tables-list-page">
      <PageHeader title="My Tables" actionButton={
        <button className="create-button" onClick={() => setIsCreateModalOpen(true)} disabled={loading}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Create Table
        </button>
      } />

      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Create New Table" footer={
        <>
          <button className="btn btn-secondary" onClick={() => setIsCreateModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreateTable} disabled={loading}>Create</button>
        </>
      }>
        <div className="form-group">
          <label htmlFor="tableName">Table Name</label>
          <input type="text" id="tableName" className="form-control" value={newTableName} onChange={(e) => setNewTableName(e.target.value)} placeholder="Enter table name" autoFocus />
        </div>
      </Modal>

      <FilterBar selectedFilter={filter} onFilterChange={(f) => { setFilter(f); setCurrentPage(1); }} options={filterOptions} />

      <SearchBar value={searchQuery} onChange={(q) => { setSearchQuery(q); setCurrentPage(1); }} placeholder="Search tables..." />

      {filteredTables.length > 0 ? (
        <div className="tables-list">
          {currentTables.map((table) => (
            <Card
              key={table.table_id}
              data={table}
              renderHeader={() => (
                <>
                  <div className="table-header-left">
                    <span className="table-name">{table.table_name}</span>
                    <span className="table-host">Hosted by {table.host_username || table.host_user_id}</span>
                  </div>
                  <div className="table-header-right">
                    <span className="activity-label">Last activity</span>
                    <span className="activity-time">{formatDate(table.last_activity_at)}</span>
                  </div>
                </>
              )}
              renderContent={() => <></>}
              renderActions={() => (
                <div className="table-actions">
                  <span className="activity-label">Created</span>
                  <span className="activity-time">{formatDate(table.created_at)}</span>
                </div>
              )}
              renderFooterLeft={() => (
                <div className="table-activity">
                  <span className="members-count">members</span>
                </div>
              )}
              renderFooterRight={() => (
                <button className="view-table-btn" onClick={() => navigate(`/tables/${table.table_id}`)}>View Table →</button>
              )}
              stateClass="table-card"
            />
          ))}
        </div>
      ) : (
        <div className="empty-state"><p>No tables match your filter criteria.</p></div>
      )}

      {filteredTables.length > tablesPerPage && (
        <div className="pagination-controls">
          <button className="pagination-button" onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1}>Previous</button>
          <span className="pagination-info">{currentPage} of {totalPages}</span>
          <button className="pagination-button" onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages}>Next</button>
        </div>
      )}
    </div>
  );
};