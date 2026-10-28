import { getStatus } from '../services/syncService.js';
import { sendSuccess } from '../utils/response.js';

export function syncStatus(req, res) {
  const status = getStatus();
  sendSuccess(res, {
    data: status,
    message: 'Sync status retrieved successfully',
    lastSyncedAt: status.lastSyncedAt,
  });
}
