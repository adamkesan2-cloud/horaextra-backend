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
      payment_method,
      request_mode,          // 'broadcast' | 'category' | 'manual'
      category_id,
      requested_provider_count,
    } = req.body;

    const client = await User.findByPk(req.user.id);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

    const requestNumber = `HE-${Date.now().toString().slice(-8)}`;

    let serviceName = 'Serviço';
    let serviceData = null;
    let servicePrice = 0;
    if (service_id) {
      serviceData = await Service.findByPk(service_id);
      if (serviceData) {
        serviceName = serviceData.name;
        servicePrice = serviceData.price || 0;
      }
    }

    const loc = safeLocation(location);
    const quantity = req.body.quantity || 1;
    const totalBudget = (budget || servicePrice) * quantity;

    // Resolve os prestadores convidados consoante o modo:
    // 'category'  → todos os aprovados/disponíveis com serviços na categoria
    // 'broadcast' → IDs já filtrados no app (prestadores online).
    // 'manual'    → seleção manual feita pelo cliente.
    const mode = request_mode || (category_id ? 'category' : 'manual');
    let invitedProviders = selected_providers;
    const wanted = mode === 'category' ? Number(requested_provider_count) || 1 : 1;
    
    if (mode === 'category') {
      if (!category_id || !requested_provider_count) {
        return res.status(400).json({ error: 'category_id e requested_provider_count são obrigatórios' });
      }
      const providers = await ProviderProfile.findAll({
        where: {
          is_approved: true,
          is_available: true,
          category_ids: { [Op.contains]: [category_id] },
        },
      });
      invitedProviders = providers.map((p) => p.user_id);
      if (invitedProviders.length === 0) {
        return res.status(400).json({ error: 'Nenhum prestador disponível nesta categoria' });
      }
    }

    const serviceRequest = await ServiceRequest.create({
      id: uuidv4(),
      request_number: requestNumber,
      service_id: service_id || null,
      client_id: client.id,
      status: invitedProviders.length > 0 ? 'providers_selected' : 'pending',
      scheduled_date: scheduled_date ? new Date(scheduled_date) : null,
      location: loc,
      budget: totalBudget,
      payment_method: payment_method || 'cash',
      payment_status: 'pending',
      request_mode: mode,
      category_id: category_id || null,
      requested_provider_count: wanted,
      accepted_providers: [],
      selected_providers: invitedProviders,
      quotes: [],
      quantity: quantity || 1,
      service_price: servicePrice,
      price_per_provider: 0,
      provider_count: 0,
      is_price_divided: false,
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
      selectedProviderIds: invitedProviders,
      budget: totalBudget,
      isUrgent: req.body.isUrgent || false,
      quantity: quantity,
      wantedProviders: wanted,
    });

    console.log(`✅ Pedido ${requestNumber} criado | modo=${mode} | ${invitedProviders.length} convidado(s) | quer ${wanted} | WS notificados: ${notified}`);

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
        { model: Service, as: 'service', attributes: ['id', 'name', 'price', 'description'] },
        { model: User, as: 'provider', attributes: ['id', 'name', 'phone', 'photo_url', 'latitude', 'longitude'] },
      ],
      order: [['created_at', 'DESC']],
    });
    
    const formatted = requests.map(req => ({
      id: req.id,
      request_number: req.request_number,
      service_id: req.service_id,
      service_name: req.service?.name || req.metadata?.service_name || 'Serviço',
      client_id: req.client_id,
      client_name: req.metadata?.client_name || 'Cliente',
      provider_id: req.provider_id,
      provider_name: req.provider?.name,
      provider_photo: req.provider?.photo_url,
      status: req.status,
      scheduled_date: req.scheduled_date,
      location: req.location,
      observations: req.observations,
      budget: req.budget,
      final_price: req.final_price,
      price: req.budget,
      created_at: req.created_at,
      updated_at: req.updated_at,
      quantity: req.quantity || 1,
      provider_count: req.provider_count || 0,
      price_per_provider: req.price_per_provider || 0,
      is_price_divided: req.is_price_divided || false,
      accepted_providers: req.accepted_providers || [],
    }));
    
    res.json({ success: true, data: formatted });
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
    
    const formatted = requests.map(req => ({
      id: req.id,
      request_number: req.request_number,
      service_name: req.service?.name || req.metadata?.service_name || 'Serviço',
      client_name: req.metadata?.client_name || 'Cliente',
      provider_id: req.provider_id,
      provider_name: req.provider?.name,
      provider_photo: req.provider?.photo_url,
      provider_lat: req.provider?.latitude,
      provider_lng: req.provider?.longitude,
      status: req.status,
      scheduled_date: req.scheduled_date,
      location: req.location,
      observations: req.observations,
      budget: req.budget,
      price: req.budget,
      created_at: req.created_at,
      updated_at: req.updated_at,
      quantity: req.quantity || 1,
      provider_count: req.provider_count || 0,
      price_per_provider: req.price_per_provider || 0,
      is_price_divided: req.is_price_divided || false,
      accepted_providers: req.accepted_providers || [],
    }));
    
    res.json({ success: true, data: formatted });
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
    
    const formatted = requests.map(req => ({
      id: req.id,
      request_number: req.request_number,
      service_name: req.service?.name || req.metadata?.service_name || 'Serviço',
      client_name: req.metadata?.client_name || 'Cliente',
      provider_id: req.provider_id,
      provider_name: req.provider?.name,
      provider_photo: req.provider?.photo_url,
      status: req.status,
      scheduled_date: req.scheduled_date,
      location: req.location,
      budget: req.budget,
      price: req.budget,
      created_at: req.created_at,
      updated_at: req.updated_at,
    }));
    
    res.json({ success: true, data: formatted });
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
        { 
          model: Service, 
          as: 'service', 
          attributes: ['id', 'name', 'price', 'description'],
          required: false
        },
        { 
          model: User, 
          as: 'client', 
          attributes: ['id', 'name', 'phone', 'photo_url', 'latitude', 'longitude'],
          required: false
        },
      ],
      order: [['created_at', 'DESC']],
    });
    
    const formatted = requests.map(req => {
      let serviceName = 'Serviço';
      
      if (req.service && req.service.name) {
        serviceName = req.service.name;
      } else if (req.metadata && req.metadata.service_name) {
        serviceName = req.metadata.service_name;
      } else if (req.observations && req.observations.length > 0) {
        serviceName = req.observations.length > 30 
          ? req.observations.substring(0, 30) + '...' 
          : req.observations;
      }
      
      return {
        id: req.id,
        request_number: req.request_number,
        service_id: req.service_id,
        service_name: serviceName,
        client_id: req.client_id,
        client_name: req.client?.name || req.metadata?.client_name || 'Cliente',
        client_phone: req.client?.phone,
        client_photo: req.client?.photo_url,
        client_lat: req.client?.latitude,
        client_lng: req.client?.longitude,
        status: req.status,
        scheduled_date: req.scheduled_date,
        location: req.location,
        observations: req.observations || '',
        budget: req.budget || 0,
        price: req.budget || 0,
        created_at: req.created_at,
        updated_at: req.updated_at,
        is_urgent: req.metadata?.is_urgent || false,
        quantity: req.quantity || 1,
        requested_provider_count: req.requested_provider_count || 1,
        accepted_providers: req.accepted_providers || [],
        price_per_provider: req.price_per_provider || 0,
        is_price_divided: req.is_price_divided || false,
        provider_count: req.provider_count || 0,
        service_price: req.service_price || 0,
      };
    });
    
    res.json({ success: true, data: formatted });
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
    
    const formatted = requests.map(req => ({
      id: req.id,
      request_number: req.request_number,
      service_name: req.service?.name || req.metadata?.service_name || 'Serviço',
      client_id: req.client_id,
      client_name: req.client?.name || req.metadata?.client_name || 'Cliente',
      client_phone: req.client?.phone,
      client_photo: req.client?.photo_url,
      client_lat: req.client?.latitude,
      client_lng: req.client?.longitude,
      status: req.status,
      scheduled_date: req.scheduled_date,
      location: req.location,
      observations: req.observations,
      budget: req.budget,
      price: req.budget,
      created_at: req.created_at,
      updated_at: req.updated_at,
      quantity: req.quantity || 1,
      provider_count: req.provider_count || 0,
      price_per_provider: req.price_per_provider || 0,
      is_price_divided: req.is_price_divided || false,
      accepted_providers: req.accepted_providers || [],
    }));
    
    res.json({ success: true, data: formatted });
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
    
    const formatted = requests.map(req => ({
      id: req.id,
      request_number: req.request_number,
      service_name: req.service?.name || req.metadata?.service_name || 'Serviço',
      client_name: req.client?.name || req.metadata?.client_name || 'Cliente',
      status: req.status,
      budget: req.budget,
      price: req.budget,
      created_at: req.created_at,
      updated_at: req.updated_at,
    }));
    
    res.json({ success: true, data: formatted });
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
    
    const formatted = {
      id: request.id,
      request_number: request.request_number,
      service_id: request.service_id,
      service_name: request.service?.name || request.metadata?.service_name || 'Serviço',
      client_id: request.client_id,
      client_name: request.client?.name || request.metadata?.client_name || 'Cliente',
      client_phone: request.client?.phone,
      client_photo: request.client?.photo_url,
      client_lat: request.client?.latitude,
      client_lng: request.client?.longitude,
      provider_id: request.provider_id,
      provider_name: request.provider?.name,
      provider_phone: request.provider?.phone,
      provider_photo: request.provider?.photo_url,
      provider_lat: request.provider?.latitude,
      provider_lng: request.provider?.longitude,
      status: request.status,
      scheduled_date: request.scheduled_date,
      location: request.location,
      observations: request.observations,
      budget: request.budget,
      final_price: request.final_price,
      created_at: request.created_at,
      updated_at: request.updated_at,
      quantity: request.quantity || 1,
      provider_count: request.provider_count || 0,
      price_per_provider: request.price_per_provider || 0,
      is_price_divided: request.is_price_divided || false,
      accepted_providers: request.accepted_providers || [],
    };
    
    res.json({ success: true, data: formatted });
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
    
    const formatted = requests.map(req => ({
      id: req.id,
      request_number: req.request_number,
      service_name: req.service?.name || req.metadata?.service_name || 'Serviço',
      client_name: req.client?.name || req.metadata?.client_name || 'Cliente',
      status: req.status,
      budget: req.budget,
      created_at: req.created_at,
    }));
    
    res.json({ success: true, data: formatted });
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
    const request = await ServiceRequest.findByPk(req.params.id, {
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name', 'price'] },
        { model: User, as: 'client', attributes: ['id', 'name'] }
      ]
    });
    
    if (!request) return res.status(404).json({ error: 'Pedido não encontrado' });

    if (req.user.role !== 'provider') {
      return res.status(403).json({ error: 'Apenas prestadores podem aceitar pedidos' });
    }

    // Pedido já fechado (quota atingida, cancelado, concluído)
    if (['completed', 'cancelled'].includes(request.status)) {
      return res.status(409).json({ error: 'Pedido já não está disponível' });
    }

    if (!request.selected_providers || !request.selected_providers.includes(req.user.id)) {
      return res.status(403).json({ error: 'Você não foi selecionado para este pedido' });
    }

    const alreadyAccepted = (request.accepted_providers || []).includes(req.user.id);
    if (alreadyAccepted) {
      return res.json({ success: true, alreadyAccepted: true });
    }

    const wanted = request.requested_provider_count || 1;
    const acceptedProviders = [...(request.accepted_providers || []), req.user.id];
    const acceptedCount = acceptedProviders.length;
    const isFull = acceptedCount >= wanted;

    // Calcular valor dividido
    const totalBudget = request.budget || 0;
    const pricePerProvider = acceptedCount > 0 ? totalBudget / acceptedCount : 0;
    const servicePrice = request.service_price || 0;

    await request.update({
      status: isFull ? 'accepted' : request.status,
      provider_id: isFull ? req.user.id : request.provider_id,
      accepted_providers: acceptedProviders,
      price_per_provider: pricePerProvider,
      provider_count: acceptedCount,
      is_price_divided: acceptedCount > 1,
      accepted_at: isFull ? new Date() : request.accepted_at,
    });

    const provider = await User.findByPk(req.user.id, {
      attributes: ['id', 'name', 'latitude', 'longitude', 'photo_url']
    });
    
    const serviceName = request.service?.name || request.metadata?.service_name || 'serviço';

    // Buscar detalhes de todos os provedores que aceitaram
    const acceptedProviderDetails = await Promise.all(
      acceptedProviders.map(async (pid) => {
        const p = await User.findByPk(pid, {
          attributes: ['id', 'name', 'latitude', 'longitude', 'photo_url']
        });
        return p ? {
          id: p.id,
          name: p.name,
          latitude: p.latitude ? parseFloat(p.latitude) : -25.9692,
          longitude: p.longitude ? parseFloat(p.longitude) : 32.5732,
          photo_url: p.photo_url
        } : null;
      })
    );

    const validProviders = acceptedProviderDetails.filter(p => p !== null);

    // Notificar cliente com todos os provedores que aceitaram
    wsStore.notifyRequestResponse({
      requestId: request.id,
      providerId: req.user.id,
      providerName: provider?.name ?? 'Prestador',
      providerLat: provider?.latitude ? parseFloat(provider.latitude) : -25.9692,
      providerLng: provider?.longitude ? parseFloat(provider.longitude) : 32.5732,
      providerPhoto: provider?.photo_url,
      accepted: true,
      isFull,
      acceptedCount,
      wanted,
      pricePerProvider,
      totalBudget,
      isPriceDivided: acceptedCount > 1,
      acceptedProviders: validProviders,
      message: acceptedCount > 1 
        ? `${provider?.name ?? 'Prestador'} aceitou o seu pedido de ${serviceName}! (${acceptedCount}/${wanted} prestadores)`
        : `${provider?.name ?? 'Prestador'} aceitou o seu pedido de ${serviceName}!`,
    });

    // Se já atingiu o número desejado, notificar que a seleção foi finalizada
    if (isFull) {
      wsStore.notifySelectionFinalized({
        requestId: request.id,
        acceptedProviders: validProviders,
        pricePerProvider,
        totalBudget,
        providerCount: acceptedCount,
        clientId: request.client_id,
      });
    }

    console.log(`✅ Pedido ${request.id} aceite por ${provider?.name} (${acceptedCount}/${wanted}) - Valor dividido: ${pricePerProvider} MT por provedor`);
    
    return res.json({ 
      success: true, 
      message: 'Pedido aceite com sucesso', 
      data: {
        id: request.id,
        status: isFull ? 'accepted' : request.status,
        isFull,
        acceptedCount,
        wanted,
        pricePerProvider,
        totalBudget,
        isPriceDivided: acceptedCount > 1,
        provider_id: req.user.id,
        provider_name: provider?.name,
        acceptedProviders: validProviders,
      }
    });
  } catch (error) {
    console.error('❌ acceptRequest:', error);
    return res.status(500).json({ error: error.message });
  }
};

exports.rejectRequest = async (req, res) => {
  try {
    const request = await ServiceRequest.findByPk(req.params.id, {
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name'] }
      ]
    });
    
    if (!request) return res.status(404).json({ error: 'Pedido não encontrado' });

    const remaining = (request.selected_providers || []).filter(
      (id) => id !== req.user.id
    );

    const newStatus = remaining.length === 0 ? 'cancelled' : 'providers_selected';

    await request.update({
      selected_providers: remaining,
      status: newStatus,
      ...(newStatus === 'cancelled' ? { cancelled_at: new Date() } : {}),
    });

    const provider = await User.findByPk(req.user.id, {
      attributes: ['id', 'name']
    });

    const serviceName = request.service?.name || request.metadata?.service_name || 'serviço';

    wsStore.notifyRequestResponse({
      requestId: request.id,
      providerId: req.user.id,
      providerName: provider?.name ?? 'Prestador',
      accepted: false,
      message: `${provider?.name ?? 'Prestador'} recusou o pedido de ${serviceName}.`,
    });

    console.log(`❌ Pedido ${request.id} recusado por ${provider?.name}`);
    return res.json({ 
      success: true, 
      message: 'Pedido recusado', 
      data: {
        id: request.id,
        status: newStatus,
        remaining_providers: remaining.length,
      }
    });
  } catch (error) {
    console.error('❌ rejectRequest:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// INICIAR SERVIÇO (provider marca que começou)
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

    wsStore.notifyServiceStarted({
      requestId: request.id,
      providerId: req.user.id,
      clientId: request.client_id,
      providerName: req.user.name,
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
exports.completeService = async (req, res) => {
  try {
    const request = await ServiceRequest.findByPk(req.params.id, {
      include: [
        { model: User, as: 'client', attributes: ['id', 'name'] },
        { model: User, as: 'provider', attributes: ['id', 'name'] },
        { model: Service, as: 'service', attributes: ['name'] }
      ]
    });
    
    if (!request) return res.status(404).json({ error: 'Pedido não encontrado' });

    if (request.client_id !== req.user.id) {
      return res.status(403).json({ error: 'Apenas o cliente pode concluir o serviço' });
    }

    if (!['accepted', 'in_progress'].includes(request.status)) {
      return res.status(400).json({ error: `Status atual: ${request.status} - não pode concluir` });
    }

    await request.update({
      status: 'completed',
      completed_at: new Date(),
      end_time: new Date(),
    });

    const clientName = request.client?.name ?? 'Cliente';
    const providerId = request.provider_id;

    wsStore.notifyServiceCompleted({
      requestId: request.id,
      clientId: req.user.id,
      clientName: clientName,
      providerId: providerId,
    });

    console.log(`✅ Serviço ${request.id} concluído pelo cliente ${clientName}`);
    return res.json({ 
      success: true, 
      message: 'Serviço concluído com sucesso', 
      data: {
        id: request.id,
        status: 'completed',
      }
    });
  } catch (error) {
    console.error('❌ completeService:', error);
    return res.status(500).json({ error: error.message });
  }
};

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

    await request.update({ 
      status: 'cancelled',
      cancelled_at: new Date(),
    });

    if (request.provider_id) {
      const provider = await User.findByPk(request.provider_id, {
        attributes: ['id', 'name']
      });
      wsStore.notifyRequestResponse({
        requestId: request.id,
        providerId: request.provider_id,
        providerName: provider?.name ?? 'Sistema',
        accepted: false,
        message: 'O cliente cancelou o pedido.',
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

// ─────────────────────────────────────────────────────────────────────────────
// ESTATÍSTICAS DO PRESTADOR
// ─────────────────────────────────────────────────────────────────────────────
exports.getProviderStats = async (req, res) => {
  try {
    const providerId = req.user.id;
    
    const [pendingCount, activeCount, completedCount, totalEarnings] = await Promise.all([
      ServiceRequest.count({
        where: {
          selected_providers: { [Op.contains]: [providerId] },
          status: { [Op.in]: ['pending', 'providers_selected'] }
        }
      }),
      ServiceRequest.count({
        where: {
          provider_id: providerId,
          status: { [Op.in]: ['accepted', 'in_progress'] }
        }
      }),
      ServiceRequest.count({
        where: {
          provider_id: providerId,
          status: 'completed'
        }
      }),
      ServiceRequest.sum('final_price', {
        where: {
          provider_id: providerId,
          status: 'completed'
        }
      })
    ]);
    
    const profile = await ProviderProfile.findOne({ where: { user_id: providerId } });
    
    res.json({
      success: true,
      data: {
        pendingRequests: pendingCount,
        activeServices: activeCount,
        completedJobs: completedCount,
        completedJobsCount: completedCount,
        totalEarnings: totalEarnings || 0,
        rating: profile?.rating || 0,
        reviewCount: profile?.review_count || 0,
        responseRate: profile?.response_rate || 100,
        acceptanceRate: profile?.acceptance_rate || 100,
      }
    });
  } catch (error) {
    console.error('❌ getProviderStats:', error);
    res.status(500).json({ error: error.message });
  }
};