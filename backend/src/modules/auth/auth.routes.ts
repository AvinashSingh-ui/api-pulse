import { Router } from 'express';
import { authController } from './auth.controller.js';
import { authenticate } from '../../middlewares/auth.js';

const router = Router();

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/oauth', authController.oauth);
router.post('/oidc/send-otp', authController.sendOidcOtp);
router.post('/oidc/verify-otp', authController.verifyOidcOtp);
router.post('/google', (req, res) => { req.body.provider = 'google'; return authController.oauth(req, res); });
router.post('/microsoft', (req, res) => { req.body.provider = 'microsoft'; return authController.oauth(req, res); });
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
router.post('/refresh', authenticate, authController.refresh);

export default router;

