const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');

console.log('✅ categoryController importado:', Object.keys(categoryController));

// Rotas públicas (com autenticação opcional)
router.get('/', categoryController.getAllCategories);
router.get('/popular', categoryController.getPopularCategories);
router.get('/stats', categoryController.getCategoryStats);
router.get('/:id', categoryController.getCategoryById);
router.get('/:id/services', categoryController.getCategoryServices);

// Rotas de admin (apenas admin)
router.post('/', authMiddleware, roleMiddleware(['admin']), categoryController.createCategory);
router.put('/:id', authMiddleware, roleMiddleware(['admin']), categoryController.updateCategory);
router.delete('/:id', authMiddleware, roleMiddleware(['admin']), categoryController.deleteCategory);
router.patch('/:id/toggle', authMiddleware, roleMiddleware(['admin']), categoryController.toggleCategoryStatus);
router.post('/reorder', authMiddleware, roleMiddleware(['admin']), categoryController.reorderCategories);

module.exports = router;