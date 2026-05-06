// backend/src/wsStore.js
const WebSocket = require('ws');

const connectedUsers = new Map();
const pendingMatches = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários de envio
// ─────────────────────────────────────────────────────────────────────────────

function send(ws, type, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type, ...payload }));
      console.log(`📤 WS enviado: ${type}`);
      return true;
    } catch (err) {
      console.error(`❌ Erro ao enviar WS [${type}]: ${err.message}`);
      return false;
    }
  }
  console.log(`⚠️ WS não disponível para enviar ${type}`);
  return false;
}

function sendToUser(userId, type, payload) {
  const user = connectedUsers.get(userId);
  if (user && user.ws && user.ws.readyState === WebSocket.OPEN) {
    console.log(`📤 Enviando ${type} para usuário ${userId}`);
    return send(user.ws, type, payload);
  }
  console.log(`⚠️ Usuário ${userId} não conectado via WS para enviar ${type}`);
  return false;
}

function broadcastToClients(type, payload) {
  let count = 0;
  connectedUsers.forEach((data, userId) => {
    if (data.role === 'client' && data.ws && data.ws.readyState === WebSocket.OPEN) {
      if (send(data.ws, type, payload)) count++;
    }
  });
  console.log(`📢 Broadcast ${type} para ${count} clientes`);
  return count;
}

function broadcastToProviders(type, payload) {
  let count = 0;
  connectedUsers.forEach((data, userId) => {
    if (data.role === 'provider' && data.ws && data.ws.readyState === WebSocket.OPEN) {
      if (send(data.ws, type, payload)) count++;
    }
  });
  console.log(`📢 Broadcast ${type} para ${count} prestadores`);
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gerenciamento de conexão
// ─────────────────────────────────────────────────────────────────────────────

function registerUser(userId, ws, name, role, lat, lng, isOnline = true) {
  const existing = connectedUsers.get(userId);
  if (existing && existing.ws !== ws) {
    try {
      if (existing.ws && existing.ws.readyState === WebSocket.OPEN) {
        existing.ws.close();
      }
    } catch(e) {}
  }

  connectedUsers.set(userId, {
    ws,
    name,
    role,
    lat: lat || -25.9692,
    lng: lng || 32.5732,
    isOnline,
    connectedAt: new Date(),
    lastHeartbeat: new Date(),
  });

  console.log(`🟢 ${name} (${role}) conectado [${userId}]`);

  if (role === 'client') {
    sendProvidersSnapshot(userId);
  } else if (role === 'provider' && isOnline) {
    broadcastProviderOnline(userId, name, lat, lng);
  }

  return true;
}

function unregisterUser(userId) {
  const user = connectedUsers.get(userId);
  if (user) {
    console.log(`🔴 Usuário ${user.name} (${user.role}) desconectado [${userId}]`);
    
    if (user.role === 'provider') {
      broadcastProviderOffline(userId, user.name);
    }
    
    connectedUsers.delete(userId);
    return true;
  }
  return false;
}

function updateUserLocation(userId, lat, lng) {
  const user = connectedUsers.get(userId);
  if (user) {
    user.lat = lat;
    user.lng = lng;
    user.lastHeartbeat = new Date();
    
    if (user.role === 'provider' && user.isOnline) {
      broadcastProviderLocation(userId, lat, lng, user.name);
    }
    return true;
  }
  return false;
}

function updateUserOnlineStatus(userId, isOnline) {
  const user = connectedUsers.get(userId);
  if (user && user.role === 'provider') {
    user.isOnline = isOnline;
    user.lastHeartbeat = new Date();
    
    if (isOnline) {
      broadcastProviderOnline(userId, user.name, user.lat, user.lng);
    } else {
      broadcastProviderOffline(userId, user.name);
    }
    return true;
  }
  return false;
}

function updateUserHeartbeat(userId) {
  const user = connectedUsers.get(userId);
  if (user) {
    user.lastHeartbeat = new Date();
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notificações de prestadores online/offline
// ─────────────────────────────────────────────────────────────────────────────

function broadcastProviderOnline(providerId, providerName, lat, lng) {
  const notified = broadcastToClients('provider_online', {
    id: providerId,
    name: providerName,
    lat: lat || -25.9692,
    lng: lng || 32.5732,
    status: 'online',
    timestamp: new Date().toISOString(),
  });
  console.log(`🟢 Prestador ${providerName} online - notificados ${notified} clientes`);
  return notified;
}

function broadcastProviderOffline(providerId, providerName) {
  const notified = broadcastToClients('provider_offline', {
    id: providerId,
    name: providerName,
    status: 'offline',
    timestamp: new Date().toISOString(),
  });
  console.log(`🔴 Prestador ${providerName} offline - notificados ${notified} clientes`);
  return notified;
}

// ─────────────────────────────────────────────────────────────────────────────
// Novo pedido: notifica prestadores selecionados IMEDIATAMENTE
// ─────────────────────────────────────────────────────────────────────────────

function notifyNewRequest({ requestId, clientId, clientName, serviceName, location, selectedProviderIds, budget, observations, isUrgent }) {
  let notified = 0;
  const ids = selectedProviderIds || [];

  console.log(`📢 NOVO PEDIDO ${requestId} → ${ids.length} prestador(es)`);

  const loc = {
    latitude:  location?.latitude  ?? location?.lat  ?? -25.9692,
    longitude: location?.longitude ?? location?.lng  ?? 32.5732,
    address:   location?.address   ?? 'Maputo, Moçambique',
  };

  ids.forEach((pid) => {
    const ok = sendToUser(pid, 'new_request', {
      requestId,
      clientId,
      clientName,
      serviceName,
      location: loc,
      budget: budget || 0,
      observations: observations || '',
      isUrgent: isUrgent || false,
      createdAt: new Date().toISOString(),
    });
    if (ok) notified++;
  });

  if (ids.length && notified === 0) {
    console.log(`⚠️ NENHUM prestador online recebeu o pedido ${requestId}`);
  }

  if (ids.length) pendingMatches.set(requestId, { providerIds: [...ids], clientId, serviceName });

  console.log(`📊 Resultado: ${notified}/${ids.length} prestadores notificados`);
  
  // Notificar cliente sobre o status do pedido
  sendToUser(clientId, 'request_sent', {
    requestId,
    notifiedCount: notified,
    totalProviders: ids.length,
    timestamp: new Date().toISOString(),
  });
  
  return notified;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resposta do prestador (aceite / recusa)
// ─────────────────────────────────────────────────────────────────────────────

function notifyRequestResponse({ requestId, providerId, providerName, accepted, providerLat, providerLng, message }) {
  console.log(`📢 Resposta pedido ${requestId}: ${accepted ? 'ACEITE ✅' : 'RECUSADO ❌'} por ${providerName}`);

  // Buscar informações do pedido
  const match = pendingMatches.get(requestId);
  const clientId = match?.clientId;

  if (accepted && clientId) {
    // Notificar cliente da aceitação
    sendToUser(clientId, 'request_accepted', {
      requestId,
      providerId,
      providerName,
      providerLat: providerLat || -25.9692,
      providerLng: providerLng || 32.5732,
      message: message || `${providerName} aceitou seu pedido e está a caminho!`,
      timestamp: new Date().toISOString(),
    });
    console.log(`📤 Cliente ${clientId} notificado sobre aceitação`);

    // Avisar os outros prestadores que o pedido já foi aceite
    const others = (match?.providerIds || []).filter(pid => pid !== providerId);
    others.forEach((pid) => {
      sendToUser(pid, 'request_taken', { 
        requestId, 
        providerName,
        message: `Este pedido foi aceite por ${providerName}`
      });
    });
    pendingMatches.delete(requestId);
    
    // Notificar todos os clientes (opcional)
    broadcastToClients('provider_response', {
      requestId,
      providerId,
      providerName,
      accepted: true,
      providerLat: providerLat || -25.9692,
      providerLng: providerLng || 32.5732,
      timestamp: new Date().toISOString(),
    });
  } else {
    // Notificar cliente da recusa (se houver outros prestadores, não notifica individualmente)
    if (match && match.providerIds.length <= 1) {
      sendToUser(clientId, 'request_rejected', {
        requestId,
        providerName,
        message: `${providerName} recusou seu pedido. Buscando outro prestador...`,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Notificar cliente via broadcast
    broadcastToClients('provider_response', {
      requestId,
      providerId,
      providerName,
      accepted: false,
      timestamp: new Date().toISOString(),
    });
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serviço iniciado pelo prestador
// ─────────────────────────────────────────────────────────────────────────────

function notifyServiceStarted({ requestId, providerId, providerName, clientId }) {
  console.log(`🚀 Serviço ${requestId} iniciado pelo prestador ${providerName}`);

  const notifiedClients = broadcastToClients('service_started', {
    requestId,
    providerId,
    providerName,
    message: `${providerName} iniciou o serviço`,
    timestamp: new Date().toISOString(),
  });

  // Notificar cliente específico
  if (clientId) {
    sendToUser(clientId, 'service_started', {
      requestId,
      providerId,
      providerName,
      message: `O prestador ${providerName} iniciou o serviço!`,
      timestamp: new Date().toISOString(),
    });
  }

  console.log(`📤 ${notifiedClients} cliente(s) notificados sobre início do serviço`);
  return notifiedClients;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serviço concluído pelo cliente
// ─────────────────────────────────────────────────────────────────────────────

function notifyServiceCompleted({ requestId, clientId, clientName, providerId, providerName, rating, review }) {
  console.log(`📢 Serviço ${requestId} CONCLUÍDO pelo cliente ${clientName}`);

  let notifiedProvider = false;

  if (providerId) {
    notifiedProvider = sendToUser(providerId, 'service_completed', {
      requestId,
      clientId,
      clientName,
      rating: rating || null,
      review: review || null,
      message: `${clientName} marcou o serviço como concluído${rating ? ` e te avaliou com ${rating}⭐` : ''}`,
      timestamp: new Date().toISOString(),
    });
    console.log(`📤 Prestador ${providerId} notificado sobre conclusão: ${notifiedProvider}`);
  }

  // Notificar todos os clientes (para actualizar listas)
  broadcastToClients('service_completed', {
    requestId,
    providerId,
    providerName,
    clientName,
    timestamp: new Date().toISOString(),
  });

  // Notificar via notificação push (se implementado)
  sendNotificationToUser(providerId, 'service_completed', {
    title: 'Serviço Concluído!',
    body: `${clientName} concluiu o serviço. Ótimo trabalho! 🎉`,
    data: { requestId, type: 'completion' }
  });

  pendingMatches.delete(requestId);

  return notifiedProvider;
}

// ─────────────────────────────────────────────────────────────────────────────
// Avaliação do prestador pelo cliente
// ─────────────────────────────────────────────────────────────────────────────

function notifyProviderRating({ providerId, clientId, clientName, rating, review, requestId }) {
  console.log(`⭐ Avaliação ${rating}⭐ para prestador ${providerId} por ${clientName}`);

  const notified = sendToUser(providerId, 'new_rating', {
    requestId,
    clientId,
    clientName,
    rating,
    review: review || '',
    message: `Você recebeu ${rating} estrelas de ${clientName}!`,
    timestamp: new Date().toISOString(),
  });

  if (notified) {
    console.log(`📤 Prestador ${providerId} notificado sobre avaliação`);
    
    // Notificar também via push
    sendNotificationToUser(providerId, 'new_rating', {
      title: 'Nova Avaliação!',
      body: `${clientName} te avaliou com ${rating}⭐${review ? `: "${review}"` : ''}`,
      data: { requestId, rating, type: 'rating' }
    });
  }

  return notified;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mensagem entre usuários
// ─────────────────────────────────────────────────────────────────────────────

function sendMessage({ fromId, fromName, toId, message, requestId }) {
  console.log(`💬 Mensagem de ${fromName} para ${toId}`);

  const delivered = sendToUser(toId, 'new_message', {
    fromId,
    fromName,
    message,
    requestId,
    timestamp: new Date().toISOString(),
  });

  if (delivered) {
    console.log(`📤 Mensagem entregue para ${toId}`);
    
    // Notificar remetente da entrega
    sendToUser(fromId, 'message_delivered', {
      toId,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  return delivered;
}

// ─────────────────────────────────────────────────────────────────────────────
// Atualização de localização do prestador
// ─────────────────────────────────────────────────────────────────────────────

function broadcastProviderLocation(providerId, lat, lng, providerName) {
  const notified = broadcastToClients('provider_location', {
    providerId,
    providerName,
    lat,
    lng,
    timestamp: new Date().toISOString(),
  });
  console.log(`📍 ${providerName} atualizou localização - notificados ${notified} clientes`);
  return notified;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enviar snapshot de prestadores online para cliente
// ─────────────────────────────────────────────────────────────────────────────

function sendProvidersSnapshot(clientId) {
  const providers = [];
  connectedUsers.forEach((data, id) => {
    if (data.role === 'provider' && data.isOnline) {
      providers.push({
        id,
        name: data.name,
        lat: data.lat,
        lng: data.lng,
        isOnline: true,
        lastHeartbeat: data.lastHeartbeat,
      });
    }
  });
  
  const sent = sendToUser(clientId, 'providers_snapshot', { providers });
  console.log(`📸 Snapshot com ${providers.length} prestadores enviado para cliente ${clientId}`);
  return sent;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notificação simulada (para quando o usuário está offline)
// ─────────────────────────────────────────────────────────────────────────────

const pendingNotifications = new Map();

function sendNotificationToUser(userId, type, payload) {
  const user = connectedUsers.get(userId);
  if (user && user.ws && user.ws.readyState === WebSocket.OPEN) {
    return sendToUser(userId, type, payload);
  } else {
    // Armazenar notificação para quando o usuário reconectar
    if (!pendingNotifications.has(userId)) {
      pendingNotifications.set(userId, []);
    }
    pendingNotifications.get(userId).push({
      type,
      payload,
      timestamp: new Date().toISOString()
    });
    console.log(`💾 Notificação ${type} armazenada para usuário ${userId} (offline)`);
    return false;
  }
}

function flushPendingNotifications(userId) {
  const pending = pendingNotifications.get(userId);
  if (pending && pending.length > 0) {
    console.log(`📦 Enviando ${pending.length} notificações pendentes para ${userId}`);
    pending.forEach(notif => {
      sendToUser(userId, notif.type, notif.payload);
    });
    pendingNotifications.delete(userId);
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Estatísticas e monitoramento
// ─────────────────────────────────────────────────────────────────────────────

function getConnectionStats() {
  const stats = {
    total: connectedUsers.size,
    clients: 0,
    providers: 0,
    onlineProviders: 0,
    pendingMatches: pendingMatches.size,
  };
  
  connectedUsers.forEach((data) => {
    if (data.role === 'client') stats.clients++;
    if (data.role === 'provider') {
      stats.providers++;
      if (data.isOnline) stats.onlineProviders++;
    }
  });
  
  return stats;
}

function heartbeatCheck() {
  const now = new Date();
  const timeout = 30000; // 30 segundos sem heartbeat
  
  connectedUsers.forEach((data, userId) => {
    if (now - data.lastHeartbeat > timeout) {
      console.log(`⏰ Heartbeat timeout para usuário ${userId}, desconectando...`);
      unregisterUser(userId);
    }
  });
}

// Iniciar heartbeat check a cada 30 segundos
setInterval(heartbeatCheck, 30000);

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  connectedUsers,
  pendingMatches,
  pendingNotifications,
  send,
  sendToUser,
  broadcastToClients,
  broadcastToProviders,
  registerUser,
  unregisterUser,
  updateUserLocation,
  updateUserOnlineStatus,
  updateUserHeartbeat,
  notifyNewRequest,
  notifyRequestResponse,
  notifyServiceStarted,
  notifyServiceCompleted,
  notifyProviderRating,
  sendMessage,
  broadcastProviderLocation,
  broadcastProviderOnline,
  broadcastProviderOffline,
  sendProvidersSnapshot,
  sendNotificationToUser,
  flushPendingNotifications,
  getConnectionStats,
};