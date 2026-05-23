// src/server.js — entry point Railway + desenvolvimento local
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
}

const http    = require('http');
const app     = require('../app');
const wsStore = require('./wsStore');

const server = http.createServer(app);
const PORT   = process.env.PORT || 4000;

// ─── Escutar IMEDIATAMENTE — antes de qualquer sync do DB ─────────────────────
// Isto garante que o healthcheck do Railway passa enquanto o DB sincroniza
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Servidor:  http://localhost:${PORT}`);
  console.log(`❤️  Health:    http://localhost:${PORT}/api/health`);
  console.log(`🔍 Diagnose:  http://localhost:${PORT}/api/diag`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws\n`);
});

// ─── WebSocket (após listen) ──────────────────────────────────────────────────
(function setupWebSocket() {
  let WebSocket;
  try {
    WebSocket = require('ws');
  } catch {
    console.warn('⚠️  Módulo ws não encontrado — servidor inicia sem WebSocket');
    return;
  }

  const wss = new WebSocket.Server({ server, path: '/ws' });
  const { connectedUsers, pendingNotifications } = wsStore;

  function wsSend(ws, type, payload = {}) {
    if (ws?.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type, ...payload })); return true; }
      catch (e) { console.error('❌ wsSend:', e.message); }
    }
    return false;
  }

  function wsBroadcast(type, payload, filter = () => true) {
    let n = 0;
    connectedUsers.forEach(({ ws }, id) => { if (filter(id) && wsSend(ws, type, payload)) n++; });
    return n;
  }

  function flushPending(userId) {
    const list = pendingNotifications.get(String(userId));
    if (!list?.length) return;
    const u = connectedUsers.get(String(userId));
    if (!u?.ws) return;
    console.log(`📦 ${list.length} notificações pendentes → ${userId}`);
    list.forEach(({ type, payload }) => wsSend(u.ws, type, payload));
    pendingNotifications.delete(String(userId));
  }

  wss.on('connection', (ws) => {
    let userId = null;

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.type) {

        case 'register': {
          userId = String(msg.userId);
          connectedUsers.set(userId, {
            ws,
            name:          msg.name  ?? 'User',
            role:          msg.role  ?? 'client',
            lat:           msg.lat   ?? -25.9692,
            lng:           msg.lng   ?? 32.5732,
            isOnline:      msg.role === 'provider' ? (msg.isOnline ?? true) : true,
            connectedAt:   new Date(),
            lastHeartbeat: new Date(),
          });
          console.log(`🔌 ${msg.name} (${msg.role}) [${userId}]`);
          wsSend(ws, 'registered', { userId });
          flushPending(userId);

          if (msg.role === 'provider') {
            try {
              const { ServiceRequest, User, Service } = require('./models');
              const { Op } = require('sequelize');
              const pending = await ServiceRequest.findAll({
                where: {
                  status:             { [Op.in]: ['pending', 'providers_selected'] },
                  selected_providers: { [Op.contains]: [userId] },
                },
                include: [
                  { model: Service, as: 'service', attributes: ['id', 'name', 'price'] },
                  { model: User,    as: 'client',  attributes: ['id', 'name', 'phone', 'photo_url', 'latitude', 'longitude'] },
                ],
                order: [['created_at', 'DESC']],
              });
              if (pending.length) {
                wsSend(ws, 'pending_requests', { requests: pending });
                console.log(`📦 ${pending.length} pedidos pendentes → ${msg.name}`);
              }
            } catch (e) { console.error('pending_requests:', e.message); }

            if (msg.isOnline !== false) {
              const n = wsBroadcast(
                'provider_online',
                { provider: { id: userId, name: msg.name, lat: msg.lat, lng: msg.lng } },
                id => connectedUsers.get(id)?.role === 'client',
              );
              console.log(`🟢 ${msg.name} online — ${n} clientes notificados`);
            }
          }

          if (msg.role === 'client') {
            wsSend(ws, 'providers_snapshot', { providers: wsStore.getOnlineProviders() });
          }
          break;
        }

        case 'location_update': {
          if (!userId) break;
          const u = connectedUsers.get(userId);
          if (!u) break;
          u.lat = msg.lat;
          u.lng = msg.lng;
          u.lastHeartbeat = new Date();
          wsBroadcast(
            'provider_location',
            { providerId: userId, lat: msg.lat, lng: msg.lng, providerName: u.name },
            id => connectedUsers.get(id)?.role === 'client',
          );
          break;
        }

        case 'set_online_status': {
          if (!userId) break;
          const u = connectedUsers.get(userId);
          if (!u || u.role !== 'provider') break;
          u.isOnline      = msg.isOnline;
          u.lastHeartbeat = new Date();
          console.log(`🔵 ${u.name} → ${msg.isOnline ? 'ONLINE ✅' : 'OFFLINE ❌'}`);
          wsBroadcast(
            msg.isOnline ? 'provider_online' : 'provider_offline',
            { provider: { id: userId, name: u.name, lat: u.lat, lng: u.lng } },
            id => connectedUsers.get(id)?.role === 'client',
          );
          break;
        }

        case 'service_request': {
          if (!userId) break;
          const { requestId, selectedProviderIds = [], serviceName, clientName, location, budget, observations, isUrgent } = msg;
          wsStore.notifyNewRequest({ requestId, clientId: userId, clientName, serviceName, location, selectedProviderIds, budget, observations, isUrgent });
          break;
        }

        case 'request_response': {
          if (!userId) break;
          const p = connectedUsers.get(userId);
          wsStore.notifyRequestResponse({
            requestId: msg.requestId, providerId: userId,
            providerName: p?.name ?? 'Prestador', accepted: msg.accepted,
            providerLat: p?.lat, providerLng: p?.lng,
            message: msg.accepted ? `${p?.name ?? 'Prestador'} aceitou o seu pedido!` : `${p?.name ?? 'Prestador'} recusou o pedido.`,
          });
          break;
        }

        case 'service_completed': {
          if (!userId) break;
          const clientName = connectedUsers.get(userId)?.name ?? 'Cliente';
          try {
            const { ServiceRequest } = require('./models');
            const req = await ServiceRequest.findByPk(msg.requestId);
            if (req?.provider_id) {
              wsStore.notifyServiceCompleted({ requestId: msg.requestId, clientId: userId, clientName, providerId: req.provider_id, rating: msg.rating, review: msg.review });
            }
          } catch (e) { console.error('service_completed:', e.message); }
          break;
        }

        case 'new_message': {
          if (!userId) break;
          wsStore.sendMessage({ fromId: userId, fromName: connectedUsers.get(userId)?.name ?? 'Usuário', toId: msg.toId, message: msg.message, requestId: msg.requestId });
          break;
        }

        case 'rate_provider': {
          if (!userId) break;
          wsStore.notifyProviderRating({ providerId: msg.providerId, clientId: userId, clientName: connectedUsers.get(userId)?.name ?? 'Cliente', rating: msg.rating, review: msg.review, requestId: msg.requestId });
          break;
        }

        case 'ping': {
          const u = connectedUsers.get(userId);
          if (u) u.lastHeartbeat = new Date();
          wsSend(ws, 'pong', { timestamp: new Date().toISOString() });
          break;
        }

        default:
          console.log(`⚠️  WS tipo desconhecido: ${msg.type}`);
      }
    });

    ws.on('close', () => {
      if (!userId) return;
      const u = connectedUsers.get(userId);
      if (u) {
        console.log(`🔴 Desconectado: ${u.name} [${userId}]`);
        if (u.role === 'provider') {
          wsBroadcast('provider_offline', { provider: { id: userId, name: u.name } }, id => connectedUsers.get(id)?.role === 'client');
        }
      }
      connectedUsers.delete(userId);
      console.log(`📊 Online: ${connectedUsers.size}`);
    });

    ws.on('error', e => console.error('❌ WS erro:', e.message));
  });

  // Heartbeat a cada 30s
  setInterval(() => {
    const cutoff = Date.now() - 30_000;
    connectedUsers.forEach((data, id) => {
      if (new Date(data.lastHeartbeat).getTime() < cutoff) {
        console.log(`⏰ Timeout: ${id}`);
        if (data.ws?.readyState === WebSocket.OPEN) data.ws.close();
        connectedUsers.delete(id);
      }
    });
  }, 30_000);

  console.log('✅ WebSocket configurado');
})();

// ─── Iniciar DB em background (não bloqueia o servidor) ───────────────────────
const { initDB } = require('../app');
initDB().then(() => {
  console.log('✅ DB pronto e servidor já a aceitar pedidos');
}).catch(err => {
  console.error('❌ DB falhou mas servidor continua:', err.message);
});