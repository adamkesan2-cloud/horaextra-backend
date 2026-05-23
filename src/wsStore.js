// src/wsStore.js — estado WebSocket partilhado e notificações de negócio
// NÃO importa modelos no topo: lazy require dentro das funções async
// para evitar crash quando o DB ainda não inicializou.

const WebSocket = require('ws');

// ─── Estado partilhado ────────────────────────────────────────────────────────
const connectedUsers       = new Map(); // userId → { ws, name, role, lat, lng, isOnline, ... }
const pendingMatches       = new Map(); // requestId → { clientId, providerIds, createdAt }
const pendingNotifications = new Map(); // userId → [{ type, payload, timestamp }]

// ─── Primitiva de envio ───────────────────────────────────────────────────────
function sendToUser(userId, type, payload = {}) {
  const uid  = String(userId);
  const user = connectedUsers.get(uid);

  if (user?.ws?.readyState === WebSocket.OPEN) {
    try {
      user.ws.send(JSON.stringify({ type, ...payload }));
      console.log(`📤 WS → ${uid}: ${type}`);
      return true;
    } catch (err) {
      console.error(`❌ sendToUser(${uid}): ${err.message}`);
    }
  } else {
    console.log(`📬 ${uid} offline — notificação guardada (${type})`);
    if (!pendingNotifications.has(uid)) pendingNotifications.set(uid, []);
    pendingNotifications.get(uid).push({ type, payload, timestamp: new Date().toISOString() });
  }
  return false;
}

// ─── Notificações de negócio ──────────────────────────────────────────────────

function notifyNewRequest({
  requestId, clientId, clientName, serviceName,
  location, selectedProviderIds = [], budget, observations, isUrgent = false,
}) {
  pendingMatches.set(requestId, {
    clientId,
    providerIds: [...selectedProviderIds],
    createdAt: new Date(),
  });

  console.log(`📢 PEDIDO ${requestId} | Cliente: ${clientName} | Serviço: ${serviceName}`);
  console.log(`   Prestadores: [${selectedProviderIds.join(', ')}]`);

  let notified = 0;
  for (const providerId of selectedProviderIds) {
    const ok = sendToUser(providerId, 'NEW_REQUEST', {
      requestId, clientId, clientName, serviceName,
      location, budget, observations, isUrgent,
      timestamp: new Date().toISOString(),
    });
    if (ok) notified++;
  }

  console.log(`   → ${notified}/${selectedProviderIds.length} notificados online`);
  return notified;
}

async function notifyRequestResponse({
  requestId, providerId, providerName, accepted, providerLat, providerLng, message,
}) {
  // Tentar obter clientId da memória primeiro, depois do banco
  let clientId = pendingMatches.get(requestId)?.clientId;

  if (!clientId) {
    try {
      const { ServiceRequest } = require('./models');
      const req = await ServiceRequest.findByPk(requestId);
      if (req) {
        clientId = req.client_id;
        pendingMatches.set(requestId, { clientId, providerIds: [providerId], createdAt: new Date() });
        console.log(`🔍 clientId ${clientId} obtido do banco para pedido ${requestId}`);
      }
    } catch (err) {
      console.error(`❌ notifyRequestResponse — banco: ${err.message}`);
    }
  }

  console.log(`📞 RESPOSTA pedido ${requestId} | ${providerName}: ${accepted ? 'ACEITOU ✅' : 'RECUSOU ❌'}`);
  console.log(`   clientId: ${clientId ?? '❌ não encontrado'}`);

  if (clientId) {
    sendToUser(clientId, accepted ? 'REQUEST_ACCEPTED' : 'REQUEST_REJECTED', {
      requestId, providerId, providerName, providerLat, providerLng,
      message: message ?? (accepted
        ? `${providerName} aceitou o seu pedido!`
        : `${providerName} recusou o pedido.`),
      timestamp: new Date().toISOString(),
    });

    if (accepted) pendingMatches.delete(requestId);
  }

  // Confirmar ao prestador
  sendToUser(providerId, accepted ? 'REQUEST_ACCEPTED_CONFIRM' : 'REQUEST_REJECTED_CONFIRM', {
    requestId,
    message: accepted ? 'Aceitou o pedido com sucesso.' : 'Recusou o pedido.',
  });
}

function notifyServiceStarted({ requestId, providerId, clientId }) {
  const targetClientId = clientId ?? pendingMatches.get(requestId)?.clientId;
  console.log(`🚀 SERVIÇO INICIADO ${requestId} | Prestador: ${providerId} | Cliente: ${targetClientId}`);
  if (targetClientId) {
    sendToUser(targetClientId, 'SERVICE_STARTED', {
      requestId, providerId,
      message: 'O prestador iniciou o serviço.',
      timestamp: new Date().toISOString(),
    });
  }
}

async function notifyServiceCompleted({
  requestId, clientId, clientName, providerId, rating, review,
}) {
  console.log(`✅ CONCLUÍDO ${requestId} | Cliente: ${clientName} | Prestador: ${providerId}`);
  if (rating) console.log(`   Avaliação: ${rating}⭐`);

  let providerName = 'Prestador';
  try {
    const { User } = require('./models');
    const p = await User.findByPk(providerId, { attributes: ['name'] });
    if (p) providerName = p.name;
  } catch (e) { console.error('notifyServiceCompleted — User:', e.message); }

  sendToUser(providerId, 'SERVICE_COMPLETED', {
    requestId, clientId, clientName, rating, review,
    message: `${clientName} marcou o serviço como concluído.`,
    timestamp: new Date().toISOString(),
  });

  sendToUser(clientId, 'SERVICE_COMPLETED_ACK', {
    requestId,
    message: 'Serviço concluído com sucesso!',
  });

  pendingMatches.delete(requestId);
}

function sendMessage({ fromId, fromName, toId, message, requestId }) {
  console.log(`💬 MENSAGEM ${fromName} → ${toId} [pedido ${requestId}]`);
  sendToUser(toId, 'NEW_MESSAGE', {
    fromId, fromName, message, requestId,
    timestamp: new Date().toISOString(),
  });
}

function notifyProviderRating({ providerId, clientId, clientName, rating, review, requestId }) {
  console.log(`⭐ AVALIAÇÃO ${rating}★ de ${clientName} para prestador ${providerId}`);
  sendToUser(providerId, 'NEW_RATING', {
    clientId, clientName, rating, review, requestId,
    message: `${clientName} avaliou-te com ${rating} estrelas.`,
    timestamp: new Date().toISOString(),
  });
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function getOnlineProviders() {
  const list = [];
  connectedUsers.forEach((d, id) => {
    if (d.role === 'provider' && d.isOnline)
      list.push({ id, name: d.name, lat: d.lat, lng: d.lng, isOnline: true, lastHeartbeat: d.lastHeartbeat });
  });
  return list;
}

function getConnectionStats() {
  let providers = 0, clients = 0;
  connectedUsers.forEach(u => { if (u.role === 'provider') providers++; else clients++; });
  return { total: connectedUsers.size, providers, clients };
}

function getPendingNotifications(userId) {
  return pendingNotifications.get(String(userId)) ?? [];
}

function clearPendingNotifications(userId) {
  const count = pendingNotifications.get(String(userId))?.length ?? 0;
  pendingNotifications.delete(String(userId));
  return count;
}

function onlineCount() { return connectedUsers.size; }

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  // estado
  connectedUsers,
  pendingMatches,
  pendingNotifications,
  // envio
  sendToUser,
  // negócio
  notifyNewRequest,
  notifyRequestResponse,
  notifyServiceStarted,
  notifyServiceCompleted,
  sendMessage,
  notifyProviderRating,
  // utilitários
  getOnlineProviders,
  getConnectionStats,
  getPendingNotifications,
  clearPendingNotifications,
  onlineCount,
};