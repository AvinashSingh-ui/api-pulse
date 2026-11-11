import { Router } from 'express';
import { endpointsController } from './endpoints.controller.js';
import { optionalAuth } from '../../middlewares/auth.js';

const router = Router();

router.get('/', optionalAuth, endpointsController.list);
router.get('/:id', optionalAuth, endpointsController.getById);
router.post('/', optionalAuth, endpointsController.create);
router.patch('/:id', optionalAuth, endpointsController.update);
router.delete('/:id', optionalAuth, endpointsController.delete);
router.post('/:id/check', optionalAuth, endpointsController.checkNow);

export default router;

