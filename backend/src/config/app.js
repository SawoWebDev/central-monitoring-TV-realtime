import 'dotenv/config';
import { parseCustomerScope } from '../utils/customerScope.js';

// General application settings (separate from the Odoo connection settings).
export const appConfig = {
  port: Number(process.env.PORT) || 4000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // true only behind our Nginx (Docker): then the client address comes from X-Forwarded-For.
  // Keep false when the backend is reachable directly, or clients could fake their address.
  trustProxy: process.env.TRUST_PROXY === 'true',
  // Seconds to wait AFTER a sync finishes before starting the next one.
  syncIntervalSeconds: Number(process.env.SYNC_INTERVAL_SECONDS) || 60,
  // Manufacturing / shipping data changes slowly and is bigger: synced less often.
  operationsSyncIntervalSeconds: Number(process.env.OPERATIONS_SYNC_INTERVAL_SECONDS) || 120,
  timezone:process.env.APP_TIMEZONE || 'Asia/Manila',
  // all | own_company: see utils/customerScope.js
  customerScope: parseCustomerScope(process.env.CUSTOMER_SCOPE),
};