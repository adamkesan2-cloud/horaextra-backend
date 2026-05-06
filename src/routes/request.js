// backend/src/routes/request.js
const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');

// =============================================================
// ROTAS DO CLIENTE
// =============================================================

// Criar novo pedido
router.post('/', authMiddleware, requestController.createRequest);

// Listar pedidos do cliente (todos)
router.get('/client', authMiddleware, requestController.getClientRequests);

// Listar serviços ativos do cliente (aceites/em andamento)
router.get('/client/active', authMiddleware, requestController.getClientActiveServices);

// Histórico do cliente (concluídos/cancelados)
router.get('/client/history', authMiddleware, requestController.getClientHistory);

// ✅ CLIENTE CONCLUI SERVIÇO
router.patch('/:id/complete', authMiddleware, roleMiddleware(['client']), requestController.completeService);

// ✅ CLIENTE CANCELA SERVIÇO
router.patch('/:id/cancel', authMiddleware, roleMiddleware(['client']), requestController.cancelRequest);

// =============================================================
// ROTAS DO PRESTADOR
// =============================================================

// Pedidos pendentes para o prestador responder
router.get('/provider/pending', authMiddleware, requestController.getProviderPendingRequests);

// Serviços ativos do prestador (aceites/em andamento)
router.get('/provider/active', authMiddleware, requestController.getProviderActiveServices);

// Histórico do prestador (concluídos/cancelados)
router.get('/provider/history', authMiddleware, requestController.getProviderHistory);

// =============================================================
// AÇÕES DO PRESTADOR
// =============================================================

// Aceitar pedido
router.patch('/:id/accept', authMiddleware, roleMiddleware(['provider']), requestController.acceptRequest);

// Rejeitar pedido
router.patch('/:id/reject', authMiddleware, roleMiddleware(['provider']), requestController.rejectRequest);

// ✅ PRESTADOR INICIA SERVIÇO (opcional)
router.patch('/:id/start', authMiddleware, roleMiddleware(['provider']), requestController.startService);

// =============================================================
// ROTAS GERAIS
// =============================================================

// Buscar pedido por ID
router.get('/:id', authMiddleware, requestController.getRequestById);

// Atualizar status do pedido
router.patch('/:id/status', authMiddleware, requestController.updateRequestStatus);

// Adicionar orçamento
router.post('/:id/quotes', authMiddleware, requestController.addQuote);

// =============================================================
// ROTA ADMINISTRATIVA
// =============================================================

router.get('/admin/all', authMiddleware, roleMiddleware(['admin']), requestController.getAllRequests);

module.exports = router;