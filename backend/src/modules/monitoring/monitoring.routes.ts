import { Router } from 'express';
import { monitoringController } from './monitoring.controller.js';
import { optionalAuth } from '../../middlewares/auth.js';

const router = Router();

router.get('/stats', optionalAuth, monitoringController.getDashboardStats);
router.get('/overview', optionalAuth, monitoringController.getOverviewTimeseries);
router.get('/endpoints/:id', optionalAuth, monitoringController.getEndpointMetrics);
router.get('/endpoints/:id/uptime', optionalAuth, monitoringController.getUptimeHistory);
router.get('/endpoints/:id/response-time', optionalAuth, monitoringController.getResponseTimeHistory);

export default router;

