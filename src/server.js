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

wss.on('connection', (ws, req) => {
  const url   = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  let userId, userName, userRole;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId   = String(decoded.id);
    userName = decoded.name;
    userRole = decoded.role;
  } catch (e) {
    ws.close(1008, 'Token inválido');
    return;
  }

  wsStore.connectedUsers.set(userId, {
    ws, name: userName, role: userRole,
    isOnline: true, lastHeartbeat: new Date(),
  });
  console.log(`🔌 WS conectado: ${userName} (${userRole})`);

  // Entregar notificações que ficaram pendentes
  const pending = wsStore.getPendingNotifications(userId);
  if (pending.length > 0) {
    pending.forEach(({ type, payload }) => wsStore.sendToUser(userId, type, payload));
    wsStore.clearPendingNotifications(userId);
  }

  ws.on('message', (raw) => {
    try {
      const msg  = JSON.parse(raw);
      const user = wsStore.connectedUsers.get(userId);
      if (msg.type === 'location_update' && user) {
        user.lat = msg.lat;
        user.lng = msg.lng;
      }
      if (msg.type === 'heartbeat') {
        if (user) user.lastHeartbeat = new Date();
        ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
      }
    } catch (e) {
      console.error('WS msg inválida:', e.message);
    }
  });

  ws.on('close', () => {
    wsStore.connectedUsers.delete(userId);
    console.log(`🔌 WS desconectado: ${userName}`);
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