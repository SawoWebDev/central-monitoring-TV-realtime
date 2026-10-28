import { Router } from 'express';
import { syncStatus } from '../controllers/syncController.js';

const router = Router();
router.get('/status', syncStatus);

export default router;