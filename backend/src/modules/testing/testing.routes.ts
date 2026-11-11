import { Router } from 'express';
import { testingController } from './testing.controller.js';
import { optionalAuth } from '../../middlewares/auth.js';

const router = Router();

router.get('/cases', optionalAuth, testingController.listTestCases);
router.post('/cases', optionalAuth, testingController.createTestCase);
router.patch('/cases/:id', optionalAuth, testingController.updateTestCase);
router.delete('/cases/:id', optionalAuth, testingController.deleteTestCase);
router.post('/cases/:id/run', optionalAuth, testingController.runTest);
router.post('/run-all', optionalAuth, testingController.runAll);
router.get('/cases/:id/results', optionalAuth, testingController.getResults);

export default router;

