import { Router } from 'express';
import * as dashboard from '../controllers/dashboardController.js';

const router = Router();
// (sales-trend, top-products and top-customers were removed at the client's request, 2026-10-19)
router.get('/summary', dashboard.summary);
router.get('/order-status', dashboard.orderStatus);
// Order-status panels below "Orders by Status" (counts only, no money)
router.get('/status-counts', dashboard.statusCounts);
router.get('/delivery-status', dashboard.deliveryStatus);
router.get('/late-orders', dashboard.lateOrders);
router.get('/quotation-aging', dashboard.quotationAging);
router.get('/salespersons', dashboard.salespersons);
router.get('/comparison', dashboard.comparison);
router.get('/filters', dashboard.filterOptions);

export default router;
