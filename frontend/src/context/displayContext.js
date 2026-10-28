import { createContext, useContext } from 'react';

// Screen preferences shared by the whole app:
// - displayMode: the on/off switch for the wall-monitor features (OFF = the normal system).
//   Today: filters and paging hidden, tables scroll by themselves.
// - sidebarOpen: whether the side menu (links + display settings) is shown.
export const DisplayContext = createContext({
  displayMode: false,
  setDisplayMode: () => {},
  sidebarOpen: false,
  setSidebarOpen: () => {},
});

export function useDisplay() {
  return useContext(DisplayContext);
}
