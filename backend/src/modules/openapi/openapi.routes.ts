import { Router } from 'express';
import { openapiController } from './openapi.controller.js';
import { optionalAuth } from '../../middlewares/auth.js';

const router = Router();

router.post('/preview', optionalAuth, openapiController.preview);
router.post('/import', optionalAuth, openapiController.importSpec);

export default router;

