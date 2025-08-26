// filepath: /home/jhudson/projects/test1/p2picks/client/src/pages/TablesListPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@features/auth";
import "./TablesListPage.css";
import { SearchBar, FilterBar, type FilterOption, Modal } from "@shared/widgets";
import AddIcon from "@shared/widgets/icons/AddIcon";
import { useTablesList } from "@features/tables/hooks";
import { formatDateTime } from "@shared/utils/dateTime";

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

  const formatDate = (dateString: string): string =>
    formatDateTime(dateString, { includeTime: true }) || "N/A";

  return (
    <div className="tables-list-page">
      <div className="page-header">
        <div className="page-title"><h1>My Tables</h1></div>
        <div className="page-action">
          <button className="create-button" onClick={() => setIsCreateModalOpen(true)} disabled={loading}>
            <AddIcon className="btn-icon" title="Add" />
            <span>Create Table</span>
          </button>
        </div>
      </div>

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
            <div key={table.table_id} className="table-card">
              <div className="table-card-header">
                <div className="table-header-left">
                  <span className="table-name">{table.table_name}</span>
                  <span className="table-host">Hosted by {table.host_username || table.host_user_id}</span>
                </div>
                <div className="table-header-right">
                  <span className="activity-label">Last activity</span>
                  <span className="activity-time">{formatDate(table.last_activity_at)}</span>
                </div>
              </div>
              <div className="table-card-content" />
              <div className="table-card-footer">
                <div className="table-activity">
                  <span className="members-count">{table.memberCount ?? 0} members</span>
                </div>
                <button className="view-table-btn" onClick={() => navigate(`/tables/${table.table_id}`)}>View Table →</button>
              </div>
            </div>
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