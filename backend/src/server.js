import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { appConfig } from './config/app.js';
import syncRoutes from './routes/syncRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import salesOrderRoutes from './routes/salesOrderRoutes.js';
import operationsRoutes from './routes/operationsRoutes.js';
import consolidationOrderRoutes from './pages/consolidationOrder/consolidationOrderRoutes.js';
import { startSync, getStatus } from './services/syncService.js';
import { startOperationsSync } from './services/operationsSyncService.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { sendSuccess } from './utils/response.js';

const app = express();

// Behind Nginx (Docker) every request comes from Nginx; trust ONE proxy hop to see the real browser address.
if (appConfig.trustProxy) app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// Only our frontend may call this API, and only with GET (read-only)
app.use(cors({ origin: appConfig.corsOrigin, methods: ['GET'] }));

// Max 600 requests per minute per client address. Every screen sends about 7 requests per refresh
// (every 30 s, or every 5 s while the backend is still starting), and all browsers that come through
// the Vite proxy share ONE address, so 120 was too low for a few monitors during a backend restart.
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 600,
    message: { success: false, message: 'Too many requests, please slow down' },
  })
);

// Opening the backend address in a browser: explain where the dashboard is.
app.get('/', (req, res) => {
  sendSuccess(res, {
    data: { dashboardUrl: appConfig.corsOrigin, healthUrl: '/api/health' },
    message: `This is the Central Monitoring API (data only). Open the dashboard at ${appConfig.corsOrigin}`,
    lastSyncedAt: getStatus().lastSyncedAt,
  });
});

app.get('/api/health', (req, res) => {
  sendSuccess(res, {
    data: { status: 'ok', uptimeSeconds: Math.round(process.uptime()) },
    message: 'Central Monitoring backend is running',
    lastSyncedAt: getStatus().lastSyncedAt,
  });
});

app.use('/api/sync', syncRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/sales-orders', salesOrderRoutes);
app.use('/api/operations', operationsRoutes);
app.use('/api/consolidation', consolidationOrderRoutes);

// Anything else: not found
app.use(notFound);

// Must be last: turns every error into a safe JSON response
app.use(errorHandler);

app.listen(appConfig.port, () => {
  console.log(`Backend listening on http://localhost:${appConfig.port}`);
  startSync(); // start reading sales data from Odoo in the background
  // Start the manufacturing / shipping sync 15 s later, so the two first syncs don't hit Odoo at once.
  setTimeout(startOperationsSync, 15_000);
});
