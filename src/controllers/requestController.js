// backend/src/controllers/requestController.js
const { ServiceRequest, Service, User, ProviderProfile } = require('../models');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const wsStore = require('../wsStore');

const DEFAULT_LOCATION = {
  latitude: -25.9692,
  longitude: 32.5732,
  address: 'Maputo, Moçambique',
};

function safeLocation(raw) {
  if (!raw) return DEFAULT_LOCATION;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return DEFAULT_LOCATION; }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRIAÇÃO DE PEDIDO
// ─────────────────────────────────────────────────────────────────────────────
exports.createRequest = async (req, res) => {
  try {
    const {
      service_id,
      client_name,
      selected_providers = [],
      location,
      budget,
      scheduled_date,
      observations,
      payment_method,
    } = req.body;

    const client = await User.findByPk(req.user.id);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

    const requestNumber = `HE-${Date.now().toString().slice(-8)}`;

    let serviceName = 'Serviço';
    let serviceData = null;
    if (service_id) {
      serviceData = await Service.findByPk(service_id);
      if (serviceData) serviceName = serviceData.name;
    }

    const loc = safeLocation(location);

    const serviceRequest = await ServiceRequest.create({
      id: uuidv4(),
      request_number: requestNumber,
      service_id: service_id || null,
      client_id: client.id,
      status: selected_providers.length > 0 ? 'providers_selected' : 'pending',
      scheduled_date: scheduled_date ? new Date(scheduled_date) : null,
      location: loc,
      observations: observations || '',
      budget: budget || 0,
      payment_method: payment_method || 'cash',
      payment_status: 'pending',
      selected_providers,
      quotes: [],
      metadata: {
        client_name: client.name,
        service_name: serviceName,
      },
    });

    const notified = wsStore.notifyNewRequest({
      requestId: serviceRequest.id,
      clientId: client.id,
      clientName: client.name,
      serviceName,
      location: loc,
      selectedProviderIds: selected_providers,
    });

    console.log(`✅ Pedido ${requestNumber} criado | ${selected_providers.length} prestador(es) | WS notificados: ${notified}`);

    return res.status(201).json({
      success: true,
      data: serviceRequest,
      id: serviceRequest.id,
      request_number: requestNumber,
    });
  } catch (error) {
    console.error('❌ createRequest:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DO CLIENTE
// ─────────────────────────────────────────────────────────────────────────────
exports.getClientRequests = async (req, res) => {
  try {
    const requests = await ServiceRequest.findAll({
      where: { client_id: req.user.id },
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name', 'price'] },
        { model: User, as: 'provider', attributes: ['id', 'name', 'phone', 'photo_url'] },
      ],
      order: [['created_at', 'DESC']],
    });
    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('❌ getClientRequests:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getClientActiveServices = async (req, res) => {
  try {
    const requests = await ServiceRequest.findAll({
      where: {
        client_id: req.user.id,
        status: { [Op.in]: ['accepted', 'in_progress'] },
      },
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name', 'price'] },
        { model: User, as: 'provider', attributes: ['id', 'name', 'phone', 'photo_url', 'latitude', 'longitude'] },
      ],
      order: [['updated_at', 'DESC']],
    });
    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('❌ getClientActiveServices:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getClientHistory = async (req, res) => {
  try {
    const requests = await ServiceRequest.findAll({
      where: {
        client_id: req.user.id,
        status: { [Op.in]: ['completed', 'cancelled'] },
      },
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name', 'price'] },
        { model: User, as: 'provider', attributes: ['id', 'name', 'photo_url'] },
      ],
      order: [['updated_at', 'DESC']],
    });
    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('❌ getClientHistory:', error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DO PRESTADOR
// ─────────────────────────────────────────────────────────────────────────────
exports.getProviderPendingRequests = async (req, res) => {
  try {
    const requests = await ServiceRequest.findAll({
      where: {
        status: { [Op.in]: ['pending', 'providers_selected'] },
        selected_providers: { [Op.contains]: [req.user.id] },
      },
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name', 'price'] },
        { model: User, as: 'client', attributes: ['id', 'name', 'phone', 'photo_url', 'latitude', 'longitude'] },
      ],
      order: [['created_at', 'DESC']],
    });
    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('❌ getProviderPendingRequests:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getProviderRequests = exports.getProviderPendingRequests;

exports.getProviderActiveServices = async (req, res) => {
  try {
    const requests = await ServiceRequest.findAll({
      where: {
        provider_id: req.user.id,
        status: { [Op.in]: ['accepted', 'in_progress'] },
      },
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name', 'price'] },
        { model: User, as: 'client', attributes: ['id', 'name', 'phone', 'photo_url', 'latitude', 'longitude'] },
      ],
      order: [['updated_at', 'DESC']],
    });
    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('❌ getProviderActiveServices:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getProviderHistory = async (req, res) => {
  try {
    const requests = await ServiceRequest.findAll({
      where: {
        provider_id: req.user.id,
        status: { [Op.in]: ['completed', 'cancelled'] },
      },
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name', 'price'] },
        { model: User, as: 'client', attributes: ['id', 'name', 'photo_url'] },
      ],
      order: [['updated_at', 'DESC']],
    });
    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('❌ getProviderHistory:', error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BUSCAR PEDIDO POR ID
// ─────────────────────────────────────────────────────────────────────────────
exports.getRequestById = async (req, res) => {
  try {
    const request = await ServiceRequest.findByPk(req.params.id, {
      include: [
        { model: Service, as: 'service' },
        { model: User, as: 'client', attributes: ['id', 'name', 'phone', 'photo_url', 'latitude', 'longitude'] },
        { model: User, as: 'provider', attributes: ['id', 'name', 'phone', 'photo_url', 'latitude', 'longitude'] },
      ],
    });
    if (!request) return res.status(404).json({ error: 'Solicitação não encontrada' });
    res.json({ success: true, data: request });
  } catch (error) {
    console.error('❌ getRequestById:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getAllRequests = async (req, res) => {
  try {
    const requests = await ServiceRequest.findAll({
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name'] },
        { model: User, as: 'client', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
      limit: 100,
    });
    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('❌ getAllRequests:', error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ACÇÕES DO PRESTADOR
// ─────────────────────────────────────────────────────────────────────────────
exports.acceptRequest = async (req, res) => {
  try {
    const request = await ServiceRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ error: 'Pedido não encontrado' });

    if (req.user.role !== 'provider') {
      return res.status(403).json({ error: 'Apenas prestadores podem aceitar pedidos' });
    }

    // Impedir aceitação dupla
    if (request.status === 'accepted') {
      return res.status(409).json({ error: 'Pedido já foi aceite' });
    }

    // Verificar se o prestador está na lista de selecionados
    if (!request.selected_providers.includes(req.user.id)) {
      return res.status(403).json({ error: 'Você não foi selecionado para este pedido' });
    }

    await request.update({
      status: 'accepted',
      provider_id: req.user.id,
      accepted_at: new Date(),
    });

    // Buscar prestador com localização
    const provider = await User.findByPk(req.user.id, {
      attributes: ['id', 'name', 'latitude', 'longitude']
    });

    // Notificar cliente via WS com localização do prestador
    wsStore.notifyRequestResponse({
      requestId: request.id,
      providerId: req.user.id,
      providerName: provider?.name ?? 'Prestador',
      accepted: true,
      providerLat: provider?.latitude ? parseFloat(provider.latitude) : -25.9692,
      providerLng: provider?.longitude ? parseFloat(provider.longitude) : 32.5732,
    });

    console.log(`✅ Pedido ${request.id} aceite por ${provider?.name}`);
    return res.json({ success: true, message: 'Pedido aceite', data: request });
  } catch (error) {
    console.error('❌ acceptRequest:', error);
    return res.status(500).json({ error: error.message });
  }
};

exports.rejectRequest = async (req, res) => {
  try {
    const request = await ServiceRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ error: 'Pedido não encontrado' });

    const remaining = (request.selected_providers || []).filter(
      (id) => id !== req.user.id
    );

    await request.update({
      selected_providers: remaining,
      status: remaining.length === 0 ? 'cancelled' : 'providers_selected',
    });

    const provider = await User.findByPk(req.user.id, {
      attributes: ['id', 'name']
    });

    wsStore.notifyRequestResponse({
      requestId: request.id,
      providerId: req.user.id,
      providerName: provider?.name ?? 'Prestador',
      accepted: false,
    });

    console.log(`❌ Pedido ${request.id} recusado por ${provider?.name}`);
    return res.json({ success: true, message: 'Pedido recusado', data: request });
  } catch (error) {
    console.error('❌ rejectRequest:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// INICIAR SERVIÇO (opcional - provider marca que começou)
// ─────────────────────────────────────────────────────────────────────────────
exports.startService = async (req, res) => {
  try {
    const request = await ServiceRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ error: 'Pedido não encontrado' });

    if (request.provider_id !== req.user.id) {
      return res.status(403).json({ error: 'Apenas o prestador pode iniciar o serviço' });
    }

    if (request.status !== 'accepted') {
      return res.status(400).json({ error: `Status atual: ${request.status} - não pode iniciar` });
    }

    await request.update({
      status: 'in_progress',
      start_time: new Date(),
    });

    // Notificar cliente que serviço começou
    wsStore.notifyServiceStarted({
      requestId: request.id,
      providerId: req.user.id,
    });

    console.log(`🚀 Serviço ${request.id} iniciado pelo prestador`);
    return res.json({ success: true, message: 'Serviço iniciado', data: request });
  } catch (error) {
    console.error('❌ startService:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ACÇÕES DO CLIENTE
// ─────────────────────────────────────────────────────────────────────────────

// ✅ CLIENTE CONCLUI SERVIÇO
exports.completeService = async (req, res) => {
  try {
    const request = await ServiceRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ error: 'Pedido não encontrado' });

    if (request.client_id !== req.user.id) {
      return res.status(403).json({ error: 'Apenas o cliente pode concluir o serviço' });
    }

    // Permite concluir apenas se estiver 'accepted' ou 'in_progress'
    if (!['accepted', 'in_progress'].includes(request.status)) {
      return res.status(400).json({ error: `Status atual: ${request.status} - não pode concluir` });
    }

    await request.update({
      status: 'completed',
      completed_at: new Date(),
      end_time: new Date(),
    });

    const client = await User.findByPk(req.user.id, {
      attributes: ['id', 'name']
    });

    wsStore.notifyServiceCompleted({
      requestId: request.id,
      clientId: req.user.id,
      clientName: client?.name ?? 'Cliente',
      providerId: request.provider_id,
    });

    console.log(`✅ Serviço ${request.id} concluído pelo cliente ${client?.name}`);
    return res.json({ success: true, message: 'Serviço concluído', data: request });
  } catch (error) {
    console.error('❌ completeService:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ✅ CLIENTE CANCELA PEDIDO
exports.cancelRequest = async (req, res) => {
  try {
    const request = await ServiceRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ error: 'Pedido não encontrado' });

    if (request.client_id !== req.user.id) {
      return res.status(403).json({ error: 'Apenas o cliente pode cancelar o pedido' });
    }

    if (['completed', 'cancelled'].includes(request.status)) {
      return res.status(400).json({ error: `Não é possível cancelar um pedido com status "${request.status}"` });
    }

    await request.update({ status: 'cancelled' });

    // Notificar prestador se já estiver atribuído
    if (request.provider_id) {
      const provider = await User.findByPk(request.provider_id, {
        attributes: ['id', 'name']
      });
      wsStore.notifyRequestResponse({
        requestId: request.id,
        providerId: request.provider_id,
        providerName: provider?.name ?? 'Sistema',
        accepted: false,
      });
    }

    console.log(`❌ Pedido ${request.id} cancelado pelo cliente`);
    return res.json({ success: true, message: 'Pedido cancelado', data: request });
  } catch (error) {
    console.error('❌ cancelRequest:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// OUTRAS OPERAÇÕES
// ─────────────────────────────────────────────────────────────────────────────
exports.updateRequestStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const request = await ServiceRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ error: 'Solicitação não encontrada' });

    if (
      req.user.role !== 'admin' &&
      request.client_id !== req.user.id &&
      request.provider_id !== req.user.id
    ) {
      return res.status(403).json({ error: 'Sem permissão para alterar status' });
    }

    await request.update({ status });
    res.json({ success: true, data: request });
  } catch (error) {
    console.error('❌ updateRequestStatus:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.addQuote = async (req, res) => {
  try {
    const { price, estimatedTime, message } = req.body;
    const request = await ServiceRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ error: 'Solicitação não encontrada' });

    const quotes = request.quotes || [];
    quotes.push({
      provider_id: req.user.id,
      price,
      estimatedTime,
      message,
      created_at: new Date(),
    });

    await request.update({ quotes, status: 'quoted' });
    res.json({ success: true, message: 'Orçamento enviado com sucesso' });
  } catch (error) {
    console.error('❌ addQuote:', error);
    res.status(500).json({ error: error.message });
  }
};