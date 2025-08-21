import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage/HomePage';
import { TablesListPage } from './pages/TablesListPage/TablesListPage';
import { TableView } from './pages/TableView/TableView';
import { TicketsPage } from './pages/TicketsPage/TicketsPage';
import { AccountPage } from './pages/AccountPage/AccountPage';
import { NotFoundPage } from './pages/NotFoundPage/NotFoundPage';
import { Navbar } from '@widgets/index';

function App() {
  return (
    <>
      <Navbar />
      <div className="app-container">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tables" element={<TablesListPage />} />
          <Route path="/tables/:tableId" element={<TableView />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </>
  );
}

export default App;