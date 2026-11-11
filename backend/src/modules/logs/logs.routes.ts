import { Router } from 'express';
import { logsController } from './logs.controller.js';
import { optionalAuth } from '../../middlewares/auth.js';

const router = Router();

router.get('/', optionalAuth, logsController.list);
router.get('/export', optionalAuth, logsController.exportLogs);
router.get('/:id', optionalAuth, logsController.getById);

export default router;

