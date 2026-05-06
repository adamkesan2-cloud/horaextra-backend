// backend/src/routes/admin.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');

// Todas as rotas de admin requerem autenticação e role admin
router.use(authMiddleware, roleMiddleware(['admin']));

router.get('/stats', adminController.getStats);
router.get('/users', adminController.getAllUsers);
router.get('/providers/pending', adminController.getPendingProviders);
router.post('/providers/:id/approve', adminController.approveProvider);
router.post('/providers/:id/reject', adminController.rejectProvider);
router.get('/reports', adminController.getReports);

module.exports = router;