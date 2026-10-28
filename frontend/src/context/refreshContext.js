import { createContext, useContext } from 'react';

// How often the monitor reloads its data from OUR backend (not from Odoo; the backend syncs Odoo itself).
export const REFRESH_INTERVAL_SECONDS = Number(import.meta.env.VITE_REFRESH_INTERVAL_SECONDS) || 30;

// Shared "refresh" signal: when refreshKey changes, every useApi() call loads its data again.
export const RefreshContext = createContext({ refreshKey: 0, refresh: () => {}, nextRefreshAt: null });

export function useRefresh() {
  return useContext(RefreshContext);
}
