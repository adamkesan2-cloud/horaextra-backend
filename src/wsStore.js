// backend/src/wsStore.js
const WebSocket = require('ws');

// ─────────────────────────────────────────────────────────────────────────────
// ESTADO PARTILHADO
// ─────────────────────────────────────────────────────────────────────────────
const connectedUsers      = new Map(); // userId -> { ws, name, role, lat, lng, isOnline, ... }
const pendingMatches      = new Map(); // requestId -> { clientId, providerIds, createdAt }
const pendingNotifications = new Map(); // userId -> [{ type, payload }]

// ─────────────────────────────────────────────────────────────────────────────
// PRIMITIVA DE ENVIO
// ─────────────────────────────────────────────────────────────────────────────
function sendToUser(userId, type, payload = {}) {
  const user = connectedUsers.get(String(userId));
  if (user && user.ws && user.ws.readyState === WebSocket.OPEN) {
    try {
      user.ws.send(JSON.stringify({ type, ...payload }));
      return true;
    } catch (err) {
      console.error(`❌ wsStore.sendToUser(${userId}): ${err.message}`);
    }
  }
  // Offline — guardar para quando o utilizador ligar
  if (!pendingNotifications.has(String(userId))) {
    pendingNotifications.set(String(userId), []);
  }
  pendingNotifications.get(String(userId)).push({ type, payload });
  console.log(`📬 Notificação pendente guardada para ${userId} (type=${type})`);
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICAÇÕES DE NEGÓCIO
// ─────────────────────────────────────────────────────────────────────────────
function notifyNewRequest({ requestId, clientId, clientName, serviceName, location, selectedProviderIds = [], budget, observations, isUrgent = false }) {
  pendingMatches.set(requestId, { clientId, providerIds: [...selectedProviderIds], createdAt: new Date() });
  let notified = 0;
  for (const providerId of selectedProviderIds) {
    const ok = sendToUser(providerId, 'NEW_REQUEST', {
      requestId, clientId, clientName, serviceName, location, budget, observations, isUrgent,
      timestamp: new Date().toISOString(),
    });
    if (ok) notified++;
  }
  console.log(`📡 notifyNewRequest [${requestId}] → ${notified}/${selectedProviderIds.length} prestadores online`);
  return notified;
}

function notifyRequestResponse({ requestId, providerId, providerName, accepted, providerLat, providerLng, message }) {
  const match = pendingMatches.get(requestId);
  const clientId = match?.clientId;
  if (clientId) {
    sendToUser(clientId, accepted ? 'REQUEST_ACCEPTED' : 'REQUEST_REJECTED', {
      requestId, providerId, providerName, providerLat, providerLng,
      message: message ?? (accepted ? `${providerName} aceitou o seu pedido!` : `${providerName} recusou o pedido.`),
      timestamp: new Date().toISOString(),
    });
    if (accepted) pendingMatches.delete(requestId);
  }
  sendToUser(providerId, accepted ? 'REQUEST_ACCEPTED_CONFIRM' : 'REQUEST_REJECTED_CONFIRM', {
    requestId,
    message: accepted ? 'Aceitou o pedido com sucesso.' : 'Recusou o pedido.',
  });
  console.log(`📡 notifyRequestResponse [${requestId}] aceite=${accepted} prestador=${providerName}`);
}

function notifyServiceStarted({ requestId, providerId, clientId }) {
  const match = pendingMatches.get(requestId);
  const targetClientId = clientId ?? match?.clientId;
  if (targetClientId) {
    sendToUser(targetClientId, 'SERVICE_STARTED', {
      requestId, providerId,
      message: 'O prestador iniciou o serviço.',
      timestamp: new Date().toISOString(),
    });
  }
  console.log(`📡 notifyServiceStarted [${requestId}] prestador=${providerId}`);
}

function notifyServiceCompleted({ requestId, clientId, clientName, providerId, rating, review }) {
  sendToUser(providerId, 'SERVICE_COMPLETED', {
    requestId, clientId, clientName, rating, review,
    message: `${clientName} marcou o serviço como concluído.`,
    timestamp: new Date().toISOString(),
  });
  sendToUser(clientId, 'SERVICE_COMPLETED_ACK', {
    requestId, message: 'Serviço concluído com sucesso!',
  });
  pendingMatches.delete(requestId);
  console.log(`📡 notifyServiceCompleted [${requestId}] cliente=${clientName} prestador=${providerId}`);
}

function sendMessage({ fromId, fromName, toId, message, requestId }) {
  sendToUser(toId, 'NEW_MESSAGE', {
    fromId, fromName, message, requestId,
    timestamp: new Date().toISOString(),
  });
  console.log(`💬 Mensagem de ${fromName} → ${toId}`);
}

function notifyProviderRating({ providerId, clientId, clientName, rating, review, requestId }) {
  sendToUser(providerId, 'NEW_RATING', {
    clientId, clientName, rating, review, requestId,
    message: `${clientName} avaliou-te com ${rating} estrelas.`,
    timestamp: new Date().toISOString(),
  });
  console.log(`⭐ Avaliação ${rating}★ de ${clientName} → prestador ${providerId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────────────────────────────────────
function getOnlineProviders() {
  const list = [];
  connectedUsers.forEach((data, id) => {
    if (data.role === 'provider' && data.isOnline)
      list.push({ id, name: data.name, lat: data.lat, lng: data.lng, isOnline: true });
  });
  return list;
}

function registerClient(userId, ws) {
  if (!connectedUsers.has(String(userId))) {
    connectedUsers.set(String(userId), {
      ws, name: 'User', role: 'client',
      lat: -25.9692, lng: 32.5732,
      isOnline: true, connectedAt: new Date(), lastHeartbeat: new Date(),
    });
  }
}

function onlineCount() { return connectedUsers.size; }

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  connectedUsers, pendingMatches, pendingNotifications,
  sendToUser,
  notifyNewRequest, notifyRequestResponse,
  notifyServiceStarted, notifyServiceCompleted,
  sendMessage, notifyProviderRating,
  registerClient, getOnlineProviders, onlineCount,
};