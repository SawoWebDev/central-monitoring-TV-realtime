import { Router } from 'express';
import * as consolidation from './consolidationOrderController.js';

// Consolidation Order page (read-only, calculated from the operations snapshot; the dashboard never calls Odoo).
const router = Router();
router.get('/lines', consolidation.lines);
router.get('/matrix', consolidation.matrix);
router.get('/export.xlsx', consolidation.exportExcel);

export default router;
