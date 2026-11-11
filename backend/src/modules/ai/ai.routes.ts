import { Router } from 'express';
import { aiController } from './ai.controller.js';
import { optionalAuth } from '../../middlewares/auth.js';

const router = Router();

router.get('/insights', optionalAuth, aiController.getInsights);
router.post('/analyze/endpoint/:id', optionalAuth, aiController.analyzeEndpoint);
router.post('/analyze/project/:id', optionalAuth, aiController.analyzeProject);
router.post('/chat', optionalAuth, aiController.chat);

export default router;

