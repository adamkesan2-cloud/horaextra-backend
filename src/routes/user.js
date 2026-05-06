// backend/src/routes/user.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');

console.log('✅ userController importado:', Object.keys(userController));

// Rotas protegidas (qualquer usuário autenticado)
router.get('/me', authMiddleware, userController.getMyProfile);
router.put('/me', authMiddleware, userController.updateUser);

// Rotas por ID (verificação de permissão dentro do controller)
router.get('/:id', authMiddleware, userController.getUserById);
router.put('/:id', authMiddleware, userController.updateUser);

// Rotas de admin (apenas admin)
router.get('/', authMiddleware, roleMiddleware(['admin']), userController.getAllUsers);
router.patch('/:id/toggle-status', authMiddleware, roleMiddleware(['admin']), userController.toggleUserStatus);

module.exports = router;