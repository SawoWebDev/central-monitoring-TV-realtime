import { useEffect, useState } from 'react';
import { useDisplay } from '../context/displayContext';

// Bump the version when a saved setting changes shape: old saved values are then simply ignored.
const PREFIX = 'cm.v1.';

// Like useState, but in DISPLAY MODE the value is saved in this browser (localStorage) and restored on the
// next load, so a wall-monitor PC keeps its settings after a restart. Display mode OFF = plain useState:
// nothing is read or saved (the normal system, unchanged).
// sanitize(saved) returns a usable value, or undefined to fall back to defaultValue (missing, outdated or
// invalid saved settings never break the page). Only screen settings are stored, never data or secrets.
export function usePersistentState(key, defaultValue, sanitize) {
  const { displayMode } = useDisplay();
  const [value, setValue] = useState(() => {
    if (!displayMode) return defaultValue;
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? defaultValue : (sanitize(JSON.parse(raw)) ?? defaultValue);
    } catch {
      return defaultValue; // storage blocked or not valid JSON
    }
  });

  useEffect(() => {
    if (!displayMode) return;
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // storage blocked: the setting simply isn't remembered
    }
  }, [displayMode, key, value]);

  return [value, setValue];
}

// Small sanitizers for usePersistentState.
export const oneOf = (...allowed) => (saved) => (allowed.includes(saved) ? saved : undefined);
export const bool = (saved) => (typeof saved === 'boolean' ? saved : undefined);
