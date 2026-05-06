// backend/src/routes/provider.js
const express = require('express');
const router = express.Router();
const providerController = require('../controllers/providerController');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');

// Rotas públicas
router.get('/nearby', providerController.findNearbyProviders);
router.get('/top-rated', providerController.getTopRatedProviders);
router.get('/specialty/:specialty', providerController.getProvidersBySpecialty);
router.get('/:id', providerController.getProviderById);
router.get('/:id/reviews', providerController.getProviderReviews);
router.get('/stats/:id', providerController.getProviderStats);

// Rotas protegidas (requerem autenticação)
router.get('/me/stats', authMiddleware, roleMiddleware(['provider']), providerController.getMyStats);
router.get('/me/services', authMiddleware, roleMiddleware(['provider']), providerController.getMyServices);
router.put('/profile', authMiddleware, roleMiddleware(['provider']), providerController.updateProviderProfile);
router.patch('/availability', authMiddleware, roleMiddleware(['provider']), providerController.toggleAvailability);

module.exports = router;