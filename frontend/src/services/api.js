import axios from 'axios';

// The ONLY way the frontend gets data: our own backend under /api (never Odoo directly).
// In development, Vite forwards /api to http://localhost:4000 (see vite.config.js).
const api = axios.create({ baseURL: '/api', timeout: 30_000 });

// --- Count requests in progress (the header's Refresh button spins while > 0) ---
let inFlight = 0;
const listeners = new Set();
function setInFlight(value) {
  inFlight = Math.max(0, value);
  listeners.forEach((listener) => listener());
}
export const requestActivity = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => inFlight,
};

api.interceptors.request.use((config) => {
  setInFlight(inFlight + 1);
  return config;
});
api.interceptors.response.use(
  (response) => {
    setInFlight(inFlight - 1);
    return response.data; // the backend's { success, data, message, lastSyncedAt, meta }
  },
  (error) => {
    setInFlight(inFlight - 1);
    return Promise.reject(error);
  }
);

// Turns any request error into a short, human message.
export function errorMessage(error) {
  if (error?.response) {
    const message = error.response.data?.message;
    if (message) return message;
    return error.response.status >= 500
      ? 'Cannot reach the backend server'
      : `Request failed (${error.response.status})`;
  }
  if (error?.code === 'ECONNABORTED') return 'The request timed out';
  return 'Cannot reach the backend server';
}

export default api;
