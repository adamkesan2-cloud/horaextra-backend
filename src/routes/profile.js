// backend/src/routes/profile.js
const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');

// ==================== CLIENTE ====================
router.get('/client', authMiddleware, roleMiddleware(['client']), profileController.getClientProfile);
router.put('/client', authMiddleware, roleMiddleware(['client']), profileController.updateClientProfile);

// ==================== PRESTADOR ====================
router.get('/provider/own', authMiddleware, roleMiddleware(['provider']), profileController.getProviderOwnProfile);
router.put('/provider', authMiddleware, roleMiddleware(['provider']), profileController.updateProviderProfile);
router.get('/provider/public/:provider_id', authMiddleware, profileController.getProviderPublicProfile);
router.patch('/provider/availability', authMiddleware, roleMiddleware(['provider']), profileController.toggleAvailability);

module.exports = router;