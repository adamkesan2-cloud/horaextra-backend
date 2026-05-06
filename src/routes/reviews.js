// backend/src/routes/reviews.js
const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');

// Criar avaliação (apenas cliente)
router.post('/', authMiddleware, roleMiddleware(['client']), reviewController.createReview);

// Buscar avaliações de um prestador
router.get('/provider/:provider_id', authMiddleware, reviewController.getProviderReviews);

// Buscar tags disponíveis
router.get('/tags', authMiddleware, reviewController.getReviewTags);

// Verificar se pode avaliar
router.get('/can-review/:provider_id', authMiddleware, roleMiddleware(['client']), reviewController.canReview);

// Estatísticas do prestador
router.get('/stats/:provider_id', authMiddleware, reviewController.getProviderStats);

module.exports = router;