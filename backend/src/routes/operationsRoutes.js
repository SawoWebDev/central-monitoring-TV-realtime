import { Router } from 'express';
import * as operations from '../controllers/operationsController.js';

// Manufacturing / shipping status report (all read-only, calculated from the operations snapshot).
const router = Router();
router.get('/status', operations.status);
router.get('/cbm-shipped', operations.cbmShipped);
router.get('/cbm-shipped/monthly', operations.cbmShippedMonthly);
router.get('/lead-time', operations.leadTime);
router.get('/manufacturing', operations.manufacturing);
router.get('/mo-cbm', operations.moCbm);
router.get('/mo-cbm/missing-volume.csv', operations.moCbmMissingVolumeCsv);
router.get('/open-orders', operations.openOrderList);
router.get('/open-orders.csv', operations.openOrderCsv);
router.get('/open-orders/by-category', operations.openOrderCategories);
router.get('/open-orders/:id/export.xlsx', operations.openOrderExcel);

export default router;
