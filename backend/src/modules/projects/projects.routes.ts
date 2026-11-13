import { Router } from 'express';
import { projectsController } from './projects.controller.js';
import { optionalAuth } from '../../middlewares/auth.js';

const router = Router();

router.get('/', optionalAuth, projectsController.list);
router.get('/:id', optionalAuth, projectsController.getById);
router.post('/', optionalAuth, projectsController.create);
router.patch('/:id', optionalAuth, projectsController.update);
router.delete('/:id/permanent', optionalAuth, projectsController.permanentDelete);
router.post('/:id/restore', optionalAuth, projectsController.restore);
router.delete('/:id', optionalAuth, projectsController.delete);

export default router;

