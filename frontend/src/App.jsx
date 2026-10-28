import { Route, Routes } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import ConsolidationOrderPage from './pages/consolidationOrder/ConsolidationOrderPage';
import PlaceholderPage from './pages/PlaceholderPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route
          path="sales-orders"
          element={<PlaceholderPage title="Sales Orders" description="The searchable order table with a read-only detail view is built in step G." />}
        />
        <Route
          path="analytics"
          element={<PlaceholderPage title="Analytics" description="Salesperson performance and the period comparison will appear here in a later step." />}
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="consolidation" element={<ConsolidationOrderPage />} />
        <Route path="*" element={<PlaceholderPage title="Page not found" description="This address does not exist. Use the menu to go back." />} />
      </Route>
    </Routes>
  );
}
