import { Router } from 'express';
import { alertsController } from './alerts.controller.js';
import { optionalAuth } from '../../middlewares/auth.js';

const router = Router();

router.get('/', optionalAuth, alertsController.listAlerts);
router.post('/:id/acknowledge', optionalAuth, alertsController.acknowledgeAlert);
router.post('/:id/resolve', optionalAuth, alertsController.resolveAlert);

router.get('/rules', optionalAuth, alertsController.listRules);
router.post('/rules', optionalAuth, alertsController.createRule);
router.patch('/rules/:id', optionalAuth, alertsController.updateRule);
router.delete('/rules/:id', optionalAuth, alertsController.deleteRule);

export default router;

