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

// Ping a cada 20s para evitar timeout do Railway
const pingInterval = setInterval(() => {
  wss.clients.forEach((client) => {
    if (!client.isAlive) return client.terminate();
    client.isAlive = false;
    client.ping();
  });
}, 20000);

wss.on('close', () => clearInterval(pingInterval));

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  console.log(`🔌 Nova conexão WS: ${req.url}`);

  const url   = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  console.log(`🔑 Token recebido: ${token ? token.substring(0, 30) + '...' : 'NENHUM'}`);

  if (!token) {
    console.log('❌ WS: sem token — fechando conexão');
    ws.close(1008, 'Token obrigatório');
    return;
  }

  let userId, userName, userRole;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId   = String(decoded.id);
    userName = decoded.name;
    userRole = decoded.role;
    console.log(`✅ WS: token válido para ${userName} (${userRole}) [${userId}]`);
  } catch (e) {
    console.error(`❌ WS: token inválido: ${e.message}`);
    ws.close(1008, 'Token inválido');
    return;
  }

  wsStore.connectedUsers.set(userId, {
    ws, name: userName, role: userRole,
    isOnline: true, lastHeartbeat: new Date(),
  });
  console.log(`🔌 WS conectado: ${userName} (${userRole})`);

  // Entregar notificações pendentes
  const pending = wsStore.getPendingNotifications(userId);
  if (pending.length > 0) {
    pending.forEach(({ type, payload }) => wsStore.sendToUser(userId, type, payload));
    wsStore.clearPendingNotifications(userId);
    console.log(`📬 ${pending.length} notificações entregues a ${userName}`);
  }

  ws.on('message', (raw) => {
    try {
      const msg  = JSON.parse(raw);
      const user = wsStore.connectedUsers.get(userId);

      console.log(`📩 WS msg de ${userName}: ${msg.type}`);

      if (msg.type === 'register') {
        if (user) {
          if (msg.lat)                    user.lat      = msg.lat;
          if (msg.lng)                    user.lng      = msg.lng;
          if (msg.isOnline !== undefined) user.isOnline = msg.isOnline;
        }
        ws.send(JSON.stringify({ type: 'registered', userId }));
        console.log(`✅ WS: registo confirmado para ${userName}`);
      }

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }

      if (msg.type === 'heartbeat') {
        if (user) user.lastHeartbeat = new Date();
        ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
      }

      if (msg.type === 'location_update' && user) {
        user.lat = msg.lat;
        user.lng = msg.lng;
      }

      if (msg.type === 'set_online_status' && user) {
        user.isOnline = msg.isOnline;
        console.log(`📡 ${userName} → isOnline: ${msg.isOnline}`);
      }

    } catch (e) {
      console.error('WS msg inválida:', e.message);
    }
  });

  ws.on('close', (code, reason) => {
    wsStore.connectedUsers.delete(userId);
    console.log(`🔌 WS desconectado: ${userName} (código: ${code}, motivo: ${reason})`);
  });

  ws.on('error', (err) => {
    console.error(`❌ WS erro (${userName}):`, err.message);
  });
});

// ── Arranque ───────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor em http://localhost:${PORT}`);
  console.log(`🔌 WebSocket em ws://localhost:${PORT}/ws`);
  console.log(`❤️  Health em http://localhost:${PORT}/api/health`);
});

const { initDB } = require('../app');
initDB()
  .then(() => console.log('✅ DB pronto'))
  .catch(e => console.error('❌ DB erro:', e.message));