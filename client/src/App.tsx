import { Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Navbar } from '@components/Navbar/Navbar';

const HomePage = lazy(() => import('./pages/HomePage/HomePage').then(m => ({ default: m.HomePage })));
const TablesListPage = lazy(() => import('./pages/TablesListPage/TablesListPage').then(m => ({ default: m.TablesListPage })));
const TableView = lazy(() => import('./pages/TableView/TableView').then(m => ({ default: m.TableView })));
const TicketsPage = lazy(() => import('./pages/TicketsPage/TicketsPage').then(m => ({ default: m.TicketsPage })));
const AccountPage = lazy(() => import('./pages/AccountPage/AccountPage').then(m => ({ default: m.AccountPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

function App() {
  return (
    <>
      <Navbar />
      <div className="app-container">
        <Suspense fallback={<div>Loading...</div>}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/tables" element={<TablesListPage />} />
            <Route path="/tables/:tableId" element={<TableView />} />
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </div>
    </>
  );
}

export default App;