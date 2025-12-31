import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@features/auth";
import "./TablesListPage.css";
import { Modal, SearchBar, LoadMoreButton } from "@shared/widgets";
import { useDialog } from "@shared/hooks/useDialog";
import AddIcon from "@shared/widgets/icons/AddIcon";
import { useTablesList } from "@features/table/hooks/useTablesList";
import { formatDateTime } from "@shared/utils/dateTime";

export const TablesListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTableName, setNewTableName] = useState("");

  const { tables, create, loading, loadingMore, loadMore, hasMore } = useTablesList(user?.id);
  const { showAlert, dialogNode } = useDialog();

  const filteredTables = tables.filter((table) =>
    searchQuery === "" || table.table_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateTable = async () => {
    if (!newTableName.trim()) {
      await showAlert({ title: "Create Table", message: "Please enter a table name." });
      return;
    }
    if (!user) {
      await showAlert({ title: "Create Table", message: "You must be logged in to create a table." });
      return;
    }
    try {
      const table = await create(newTableName);
      setIsCreateModalOpen(false);
      setNewTableName("");
      navigate(`/tables/${table.table_id}`);
    } catch (e: any) {
      await showAlert({
        title: "Create Table",
        message: `Failed to create table: ${e?.message || e}`,
      });
    }
  };

  const formatDate = (dateString: string): string =>
    formatDateTime(dateString, { includeTime: true }) || "N/A";

  return (
    <>
      <div className="tables-list-page">
        <div className="page-header">
          <div className="page-title"><h1>Tables</h1></div>
          <div className="page-action">
            <button className="create-button" onClick={() => setIsCreateModalOpen(true)} disabled={loading}>
              <AddIcon className="btn-icon" title="Add" />
              <span>Create Table</span>
            </button>
          </div>
        </div>

        <SearchBar value={searchQuery} onChange={(q) => { setSearchQuery(q); }} placeholder="Search tables..." />

        <div className="tables-page-container">

          <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Create New Table" footer={
            <>
              <button className="btn btn-secondary" onClick={() => setIsCreateModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateTable} disabled={loading}>Create</button>
            </>
          }>
            <div className="form-group">
              <label htmlFor="tableName">Table Name</label>
              <input type="text" id="tableName" className="form-control" value={newTableName} onChange={(e) => setNewTableName(e.target.value)} placeholder="Enter name..." autoFocus />
            </div>
          </Modal>

          {filteredTables.length > 0 ? (
            <div className="tables-list">
              {filteredTables.map((table) => (
                <div key={table.table_id} className="table-card">
                  <div className="table-card-header">
                    <div className="table-header-left">
                      <span className="table-name">{table.table_name}</span>
                      <span className="table-host">Host: {table.host_username || table.host_user_id}</span>
                    </div>
                    <div className="table-header-right">
                      <span className="activity-label">Last activity</span>
                      <span className="activity-time">{formatDate(table.last_activity_at)}</span>
                    </div>
                  </div>
                  <div className="table-card-content" />
                  <div className="table-card-footer">
                    <div className="table-activity">
                      <span className="members-count">{table.memberCount ?? 0} {(table.memberCount ?? 0) > 1 ? "members" : "member"}</span>
                    </div>
                    <button className="view-table-btn" onClick={() => navigate(`/tables/${table.table_id}`)}>View Table →</button>
                  </div>
                </div>

              ))}
            </div>
          ) : (
            <div className="empty-state"><p>No tables match your filter criteria.</p></div>
          )}
          {hasMore && (
            <div className="tables-pagination">
              <LoadMoreButton
                label="Load more tables"
                loadingLabel="Loading..."
                loading={loadingMore}
                disabled={loadingMore || loading}
                onClick={loadMore}
              />
            </div>
          )}
        </div>
      </div>
      {dialogNode}
    </>
  );
};