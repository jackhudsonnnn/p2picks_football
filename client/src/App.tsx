import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { PublicTablesPage } from './pages/PublicTablesPage';
import { PrivateTablesListPage } from './pages/PrivateTablesListPage';
import { PrivateTableView } from './pages/PrivateTableView';
import { TicketsPage } from './pages/TicketsPage';
import { AccountPage } from './pages/AccountPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { Navbar } from '@widgets';

function App() {
  return (
    <>
      <Navbar />
      <div className="app-container">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/public-tables" element={<PublicTablesPage />} />
          <Route path="/private-tables" element={<PrivateTablesListPage />} />
          <Route path="/private-tables/:tableId" element={<PrivateTableView />} />
          <Route path="/bets-history" element={<TicketsPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </>
  );
}

export default App;