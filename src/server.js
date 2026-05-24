// src/server.js
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
}

const http                = require('http');
const { WebSocketServer } = require('ws');
const jwt                 = require('jsonwebtoken');
const app                 = require('../app');
const wsStore             = require('./wsStore');

const server = http.createServer(app);
const PORT   = process.env.PORT || 4000;

// ── WebSocket ──────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

// ── Ping a cada 15s para evitar timeout do Railway ─────────────────────────
// NOTA: Flutter Web não responde a pings WebSocket nativos do protocolo.
// Por isso usamos ws.isAlive = true em cada mensagem JSON recebida também.
const pingInterval = setInterval(() => {
  wss.clients.forEach((client) => {
    if (!client.isAlive) {
      console.log(`🔌 WS: cliente inactivo terminado (userId: ${client.userId ?? 'não autenticado'})`);
      return client.terminate();
    }
    client.isAlive = false;
    client.ping();
  });
}, 15000);

wss.on('close', () => clearInterval(pingInterval));

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.userId  = null;

  // Responde a pongs do protocolo WebSocket nativo (clientes nativos)
  ws.on('pong', () => { ws.isAlive = true; });

  console.log(`🔌 Nova conexão WS recebida`);

  // ── Timeout de autenticação — 10 segundos ─────────────────────────────
  const authTimeout = setTimeout(() => {
    if (!ws.userId) {
      console.log('❌ WS: timeout de autenticação — fechando');
      ws.close(1008, 'Timeout de autenticação');
    }
  }, 10000);

  ws.on('message', (raw) => {
    // ✅ FIX: Flutter Web não responde a pings nativos WS,
    // por isso marcamos isAlive em cada mensagem JSON recebida
    ws.isAlive = true;

    try {
      const msg = JSON.parse(raw);

      // ── Autenticação (primeira mensagem obrigatória) ───────────────────
      if (!ws.userId) {
        if (msg.type !== 'auth' && msg.type !== 'register') {
          console.log(`❌ WS: mensagem sem autenticação: ${msg.type}`);
          ws.close(1008, 'Autenticação necessária');
          return;
        }

        const token = msg.token;
        if (!token) {
          console.log('❌ WS: sem token');
          ws.close(1008, 'Token obrigatório');
          return;
        }

        let userId, userName, userRole;
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          userId   = String(decoded.id);
          userName = decoded.name;
          userRole = decoded.role;
        } catch (e) {
          console.error(`❌ WS: token inválido: ${e.message}`);
          ws.close(1008, 'Token inválido');
          return;
        }

        clearTimeout(authTimeout);
        ws.userId = userId;

        // Se já havia uma conexão anterior para este userId, fechar a antiga
        const existing = wsStore.connectedUsers.get(userId);
        if (existing?.ws && existing.ws !== ws && existing.ws.readyState === 1 /* OPEN */) {
          console.log(`🔄 WS: substituindo conexão antiga para ${userName}`);
          try { existing.ws.close(1000, 'Substituído por nova conexão'); } catch (_) {}
        }

        wsStore.connectedUsers.set(userId, {
          ws,
          name:          userName,
          role:          userRole,
          isOnline:      msg.isOnline !== false,
          lastHeartbeat: new Date(),
          lat:           msg.lat  ?? null,
          lng:           msg.lng  ?? null,
        });

        console.log(`✅ WS: autenticado ${userName} (${userRole}) [${userId}]`);

        // Confirmar registo ao cliente
        ws.send(JSON.stringify({ type: 'registered', userId }));

        // ── Entregar notificações pendentes ───────────────────────────
        const pending = wsStore.getPendingNotifications(userId);
        if (pending.length > 0) {
          console.log(`📬 Entregando ${pending.length} notificações pendentes a ${userName}`);
          pending.forEach(({ type, payload }) => {
            try {
              ws.send(JSON.stringify({ type, ...payload }));
            } catch (e) {
              console.error(`❌ Erro ao entregar notificação pendente: ${e.message}`);
            }
          });
          wsStore.clearPendingNotifications(userId);
        }

        // ── Snapshot imediato para o tipo de utilizador ───────────────
        if (userRole === 'client') {
          // Enviar lista de providers online ao cliente
          const providers = wsStore.getOnlineProviders();
          if (providers.length > 0) {
            ws.send(JSON.stringify({ type: 'providers_snapshot', providers }));
            console.log(`📡 Snapshot: ${providers.length} providers enviados a ${userName}`);
          }
        }

        if (userRole === 'provider') {
          // Enviar pedidos pendentes ao provider via WS (complementar à API)
          _sendProviderPendingRequestsSnapshot(ws, userId, userName);
        }

        return;
      }

      // ── Mensagens normais (após autenticação) ─────────────────────────
      const user = wsStore.connectedUsers.get(ws.userId);

      switch (msg.type) {

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'pong':
          // cliente respondeu ao nosso ping JSON (redundante com ws.isAlive acima)
          break;

        case 'heartbeat':
          if (user) user.lastHeartbeat = new Date();
          ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
          break;

        case 'location_update':
          if (user) {
            user.lat = msg.lat;
            user.lng = msg.lng;
            // Reencaminhar localização do provider a todos os clientes online
            if (user.role === 'provider') {
              _broadcastProviderLocation(ws.userId, user, msg.lat, msg.lng);
            }
          }
          break;

        case 'set_online_status':
          if (user) {
            user.isOnline = msg.isOnline;
            console.log(`📡 ${user.name} → isOnline: ${msg.isOnline}`);
            // Notificar clientes sobre mudança de estado do provider
            if (user.role === 'provider') {
              _broadcastProviderStatus(ws.userId, user, msg.isOnline);
            }
          }
          break;

        // request_response tratado no requestController via API REST
        // mas suportamos também via WS para flexibilidade futura
        case 'request_response':
          console.log(`📨 WS request_response: ${msg.requestId} accepted=${msg.accepted}`);
          if (user) {
            wsStore.notifyRequestResponse({
              requestId:    msg.requestId,
              providerId:   ws.userId,
              providerName: user.name,
              accepted:     msg.accepted,
            });
          }
          break;

        default:
          console.log(`⚠️ WS: tipo desconhecido → ${msg.type}`);
      }

    } catch (e) {
      console.error('WS msg inválida:', e.message);
    }
  });

  ws.on('close', (code, reason) => {
    clearTimeout(authTimeout);
    if (ws.userId) {
      const user = wsStore.connectedUsers.get(ws.userId);
      // Só remover se esta WS ainda é a activa para este userId
      if (user?.ws === ws) {
        wsStore.connectedUsers.delete(ws.userId);
        console.log(`🔌 WS desconectado: ${user?.name ?? ws.userId} (código: ${code})`);
        // Notificar clientes que provider ficou offline
        if (user?.role === 'provider') {
          _broadcastProviderStatus(ws.userId, user, false);
        }
      }
    }
  });

  ws.on('error', (err) => {
    console.error(`❌ WS erro:`, err.message);
  });
});

// ── Helpers internos ───────────────────────────────────────────────────────

function _broadcastProviderLocation(providerId, user, lat, lng) {
  const payload = JSON.stringify({
    type: 'provider_location',
    providerId,
    lat,
    lng,
  });
  wss.clients.forEach((client) => {
    const cu = wsStore.connectedUsers.get(client.userId ?? '');
    if (cu?.role === 'client' && client.readyState === 1 /* OPEN */) {
      try { client.send(payload); } catch (_) {}
    }
  });
}

function _broadcastProviderStatus(providerId, user, isOnline) {
  const payload = JSON.stringify({
    type: isOnline ? 'provider_online' : 'provider_offline',
    provider: { id: providerId, name: user.name, lat: user.lat, lng: user.lng, isOnline },
  });
  wss.clients.forEach((client) => {
    const cu = wsStore.connectedUsers.get(client.userId ?? '');
    if (cu?.role === 'client' && client.readyState === 1 /* OPEN */) {
      try { client.send(payload); } catch (_) {}
    }
  });
}

// Envia snapshot de pedidos pendentes ao provider recém-ligado
async function _sendProviderPendingRequestsSnapshot(ws, userId, userName) {
  try {
    const { ServiceRequest, Service, User } = require('../app').models
      ?? require('./models');

    const { Op } = require('sequelize');

    const requests = await ServiceRequest.findAll({
      where: {
        status: { [Op.in]: ['pending', 'providers_selected'] },
        selected_providers: { [Op.contains]: [userId] },
      },
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name', 'price'], required: false },
        { model: User,    as: 'client',  attributes: ['id', 'name', 'phone', 'photo_url'], required: false },
      ],
      order: [['created_at', 'DESC']],
      limit: 20,
    });

    if (requests.length === 0) return;

    const formatted = requests.map(r => ({
      id:             r.id,
      request_number: r.request_number,
      service_id:     r.service_id,
      service_name:   r.service?.name || r.metadata?.service_name || 'Serviço',
      client_id:      r.client_id,
      client_name:    r.client?.name  || r.metadata?.client_name  || 'Cliente',
      client_phone:   r.client?.phone,
      client_photo:   r.client?.photo_url,
      status:         r.status,
      scheduled_date: r.scheduled_date,
      location:       r.location,
      observations:   r.observations || '',
      budget:         r.budget || 0,
      created_at:     r.created_at,
      is_urgent:      r.metadata?.is_urgent || false,
    }));

    if (ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify({ type: 'pending_requests', requests: formatted }));
      console.log(`📋 Snapshot: ${formatted.length} pedidos pendentes enviados a ${userName}`);
    }
  } catch (e) {
    console.error(`❌ _sendProviderPendingRequestsSnapshot: ${e.message}`);
  }
}

// ── Arranque ───────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`🔌 WebSocket em ws://localhost:${PORT}/ws`);
  console.log(`🗺️  Rota OSRM em http://localhost:${PORT}/api/route`);
  console.log(`❤️  Health check em http://localhost:${PORT}/api/health\n`);
});

const { initDB } = require('../app');
initDB()
  .then(() => console.log('✅ DB pronto'))
  .catch(e => console.error('❌ DB erro:', e.message));