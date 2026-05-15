// backend/src/wsStore.js
const WebSocket = require('ws');
const { ServiceRequest, User } = require('./models');

// ─────────────────────────────────────────────────────────────────────────────
// ESTADO PARTILHADO
// ─────────────────────────────────────────────────────────────────────────────
const connectedUsers = new Map();
const pendingMatches = new Map();
const pendingNotifications = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// PRIMITIVA DE ENVIO
// ─────────────────────────────────────────────────────────────────────────────
function sendToUser(userId, type, payload = {}) {
  const user = connectedUsers.get(String(userId));
  if (user && user.ws && user.ws.readyState === WebSocket.OPEN) {
    try {
      user.ws.send(JSON.stringify({ type, ...payload }));
      console.log(`📤 WS enviado para ${userId}: ${type}`);
      return true;
    } catch (err) {
      console.error(`❌ wsStore.sendToUser(${userId}): ${err.message}`);
    }
  } else {
    console.log(`⚠️ Usuário ${userId} não está online (estado: ${user?.ws?.readyState ?? 'desconectado'})`);
  }
  
  // Offline — guardar para quando o utilizador ligar
  if (!pendingNotifications.has(String(userId))) {
    pendingNotifications.set(String(userId), []);
  }
  pendingNotifications.get(String(userId)).push({ type, payload, timestamp: new Date().toISOString() });
  console.log(`📬 Notificação pendente guardada para ${userId} (type=${type}) - Total: ${pendingNotifications.get(String(userId)).length}`);
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICAÇÕES DE NEGÓCIO
// ─────────────────────────────────────────────────────────────────────────────
function notifyNewRequest({ requestId, clientId, clientName, serviceName, location, selectedProviderIds = [], budget, observations, isUrgent = false }) {
  pendingMatches.set(requestId, { clientId, providerIds: [...selectedProviderIds], createdAt: new Date() });
  let notified = 0;
  let offline = 0;
  
  console.log(`📢 NOVO PEDIDO ${requestId}`);
  console.log(`   Cliente: ${clientName} (${clientId})`);
  console.log(`   Serviço: ${serviceName}`);
  console.log(`   Prestadores: ${selectedProviderIds.join(', ')}`);
  
  for (const providerId of selectedProviderIds) {
    const ok = sendToUser(providerId, 'NEW_REQUEST', {
      requestId, clientId, clientName, serviceName, location, budget, observations, isUrgent,
      timestamp: new Date().toISOString(),
    });
    if (ok) {
      notified++;
    } else {
      offline++;
    }
  }
  
  console.log(`📡 notifyNewRequest [${requestId}] → ${notified} notificados, ${offline} offline`);
  return notified;
}

async function notifyRequestResponse({ requestId, providerId, providerName, accepted, providerLat, providerLng, message }) {
  // 🔧 FIX: Buscar clientId do banco se não estiver no pendingMatches
  let match = pendingMatches.get(requestId);
  let clientId = match?.clientId;
  
  // Se não encontrou na memória, buscar do banco de dados
  if (!clientId) {
    try {
      const request = await ServiceRequest.findByPk(requestId);
      if (request) {
        clientId = request.client_id;
        // Guardar no pendingMatches para futuras notificações
        pendingMatches.set(requestId, { clientId, providerIds: [providerId], createdAt: new Date() });
        console.log(`🔍 Cliente ${clientId} encontrado no banco para pedido ${requestId}`);
      }
    } catch (err) {
      console.error(`❌ Erro ao buscar pedido ${requestId} no banco:`, err.message);
    }
  }
  
  console.log(`📢 RESPOSTA para pedido ${requestId}`);
  console.log(`   Prestador: ${providerName} (${providerId})`);
  console.log(`   Resposta: ${accepted ? 'ACEITOU ✅' : 'RECUSOU ❌'}`);
  console.log(`   Cliente encontrado: ${clientId || '❌ NÃO ENCONTRADO'}`);
  
  if (clientId) {
    const sent = sendToUser(clientId, accepted ? 'REQUEST_ACCEPTED' : 'REQUEST_REJECTED', {
      requestId, providerId, providerName, providerLat, providerLng,
      message: message ?? (accepted ? `${providerName} aceitou o seu pedido!` : `${providerName} recusou o pedido.`),
      timestamp: new Date().toISOString(),
    });
    console.log(`   Cliente ${clientId} notificado: ${sent ? '✅' : '❌'}`);
    
    if (accepted) {
      pendingMatches.delete(requestId);
      console.log(`   Pedido ${requestId} removido dos matches pendentes`);
    }
  } else {
    console.log(`   ⚠️ Cliente NÃO ENCONTRADO para pedido ${requestId} - verificar banco de dados`);
  }
  
  sendToUser(providerId, accepted ? 'REQUEST_ACCEPTED_CONFIRM' : 'REQUEST_REJECTED_CONFIRM', {
    requestId,
    message: accepted ? 'Aceitou o pedido com sucesso.' : 'Recusou o pedido.',
  });
}

function notifyServiceStarted({ requestId, providerId, clientId }) {
  const match = pendingMatches.get(requestId);
  const targetClientId = clientId ?? match?.clientId;
  
  console.log(`🚀 SERVIÇO INICIADO ${requestId}`);
  console.log(`   Prestador: ${providerId}`);
  console.log(`   Cliente: ${targetClientId}`);
  
  if (targetClientId) {
    sendToUser(targetClientId, 'SERVICE_STARTED', {
      requestId, providerId,
      message: 'O prestador iniciou o serviço.',
      timestamp: new Date().toISOString(),
    });
  }
}

async function notifyServiceCompleted({ requestId, clientId, clientName, providerId, rating, review }) {
  console.log(`✅ SERVIÇO CONCLUÍDO ${requestId}`);
  console.log(`   Cliente: ${clientName} (${clientId})`);
  console.log(`   Prestador: ${providerId}`);
  if (rating) console.log(`   Avaliação: ${rating}⭐`);
  
  // Buscar providerName se necessário
  let providerName = 'Prestador';
  if (providerId) {
    try {
      const provider = await User.findByPk(providerId, { attributes: ['name'] });
      if (provider) providerName = provider.name;
    } catch (err) {
      console.error(`❌ Erro ao buscar prestador ${providerId}:`, err.message);
    }
  }
  
  const sentToProvider = sendToUser(providerId, 'SERVICE_COMPLETED', {
    requestId, clientId, clientName, rating, review,
    message: `${clientName} marcou o serviço como concluído.`,
    timestamp: new Date().toISOString(),
  });
  
  const sentToClient = sendToUser(clientId, 'SERVICE_COMPLETED_ACK', {
    requestId, message: 'Serviço concluído com sucesso!',
  });
  
  console.log(`   Notificações: Prestador=${sentToProvider ? '✅' : '❌'}, Cliente=${sentToClient ? '✅' : '❌'}`);
  
  pendingMatches.delete(requestId);
}

function sendMessage({ fromId, fromName, toId, message, requestId }) {
  console.log(`💬 MENSAGEM de ${fromName} (${fromId}) para ${toId}`);
  console.log(`   Pedido: ${requestId}`);
  console.log(`   Mensagem: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
  
  sendToUser(toId, 'NEW_MESSAGE', {
    fromId, fromName, message, requestId,
    timestamp: new Date().toISOString(),
  });
}

function notifyProviderRating({ providerId, clientId, clientName, rating, review, requestId }) {
  console.log(`⭐ NOVA AVALIAÇÃO`);
  console.log(`   Prestador: ${providerId}`);
  console.log(`   Cliente: ${clientName} (${clientId})`);
  console.log(`   Nota: ${rating}⭐`);
  if (review) console.log(`   Comentário: ${review}`);
  
  sendToUser(providerId, 'NEW_RATING', {
    clientId, clientName, rating, review, requestId,
    message: `${clientName} avaliou-te com ${rating} estrelas.`,
    timestamp: new Date().toISOString(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────────────────────────────────────
function getOnlineProviders() {
  const list = [];
  connectedUsers.forEach((data, id) => {
    if (data.role === 'provider' && data.isOnline) {
      list.push({ 
        id, 
        name: data.name, 
        lat: data.lat, 
        lng: data.lng, 
        isOnline: true,
        lastHeartbeat: data.lastHeartbeat
      });
    }
  });
  console.log(`📊 ${list.length} prestadores online`);
  return list;
}

function registerClient(userId, ws) {
  if (!connectedUsers.has(String(userId))) {
    connectedUsers.set(String(userId), {
      ws, 
      name: 'User', 
      role: 'client',
      lat: -25.9692, 
      lng: 32.5732,
      isOnline: true, 
      connectedAt: new Date(), 
      lastHeartbeat: new Date(),
    });
    console.log(`🟢 Cliente ${userId} registado no wsStore`);
  }
}

function getPendingNotifications(userId) {
  return pendingNotifications.get(String(userId)) || [];
}

function clearPendingNotifications(userId) {
  const count = pendingNotifications.get(String(userId))?.length || 0;
  pendingNotifications.delete(String(userId));
  console.log(`🗑️ ${count} notificações pendentes limpas para ${userId}`);
  return count;
}

function onlineCount() { 
  const count = connectedUsers.size;
  console.log(`📊 Total de usuários conectados: ${count}`);
  return count;
}

function getConnectionStats() {
  const providers = Array.from(connectedUsers.values()).filter(u => u.role === 'provider').length;
  const clients = Array.from(connectedUsers.values()).filter(u => u.role === 'client').length;
  return { total: connectedUsers.size, providers, clients };
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  connectedUsers, 
  pendingMatches, 
  pendingNotifications,
  sendToUser,
  notifyNewRequest, 
  notifyRequestResponse,
  notifyServiceStarted, 
  notifyServiceCompleted,
  sendMessage, 
  notifyProviderRating,
  registerClient, 
  getOnlineProviders,
  getPendingNotifications,
  clearPendingNotifications,
  onlineCount,
  getConnectionStats,
};