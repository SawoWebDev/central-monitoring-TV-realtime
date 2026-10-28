import { useEffect, useMemo, useState } from 'react';
import { DisplayContext } from './displayContext';

// Saved in this browser only (each display PC keeps its own choice). Holds no data, only true/false.
const DISPLAY_MODE_KEY = 'cm.displayMode.v1';
// Same prefix as hooks/usePersistentState.js (that hook can't be used here: it needs this provider).
const SIDEBAR_KEY = 'cm.v1.sidebarOpen';

// A missing, unreadable or invalid saved value counts as false.
function readFlag(key) {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false; // storage blocked (e.g. private window)
  }
}
function writeFlag(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // storage blocked: the choice simply isn't remembered
  }
}

// Display mode is the switch for the wall-monitor features. OFF on a browser's first visit (normal view);
// once ticked it is always remembered, so a wall-monitor PC stays in Display mode after a restart.
// The side menu open/closed is remembered only in Display mode (like the other settings).
export default function DisplayProvider({ children }) {
  const [displayMode, setDisplayMode] = useState(() => readFlag(DISPLAY_MODE_KEY));
  const [sidebarOpen, setSidebarOpen] = useState(() => readFlag(DISPLAY_MODE_KEY) && readFlag(SIDEBAR_KEY));

  useEffect(() => writeFlag(DISPLAY_MODE_KEY, displayMode), [displayMode]);
  useEffect(() => {
    if (displayMode) writeFlag(SIDEBAR_KEY, sidebarOpen);
  }, [displayMode, sidebarOpen]);

  const value = useMemo(() => ({ displayMode, setDisplayMode, sidebarOpen, setSidebarOpen }), [displayMode, sidebarOpen]);
  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}
