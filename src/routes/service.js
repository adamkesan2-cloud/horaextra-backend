const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');

console.log('✅ serviceController importado:', Object.keys(serviceController));

// Rotas públicas (com autenticação opcional)
router.get('/', serviceController.getAllServices);
router.get('/search', serviceController.searchServices);
router.get('/category/:categoryId', serviceController.getServicesByCategory);
router.get('/:id', serviceController.getServiceById);

// Rotas de admin (apenas admin)
router.get('/admin/all', authMiddleware, roleMiddleware(['admin']), serviceController.getAllServicesAdmin);
router.post('/', authMiddleware, roleMiddleware(['admin']), serviceController.createService);
router.put('/:id', authMiddleware, roleMiddleware(['admin']), serviceController.updateService);
router.delete('/:id', authMiddleware, roleMiddleware(['admin']), serviceController.deleteService);
router.patch('/:id/toggle', authMiddleware, roleMiddleware(['admin']), serviceController.toggleServiceStatus);

// Rotas de prestador (apenas provider)
router.get('/provider/me', authMiddleware, roleMiddleware(['provider']), serviceController.getProviderServices);

module.exports = router;