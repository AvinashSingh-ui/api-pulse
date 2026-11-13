import { Router } from 'express';
import { notificationsController } from './notifications.controller.js';

const router = Router();

router.get('/', notificationsController.list);
router.get('/unread-count', notificationsController.getUnreadCount);
router.patch('/:id/read', notificationsController.markAsRead);
router.post('/read-all', notificationsController.markAllAsRead);
router.delete('/:id', notificationsController.delete);
router.delete('/', notificationsController.clearAll);

export default router;
