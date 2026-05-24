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
  ws.userId  = null;
  ws.on('pong', () => { ws.isAlive = true; });

  console.log(`🔌 Nova conexão WS recebida`);

  // Timeout de autenticação — 10 segundos
  const authTimeout = setTimeout(() => {
    if (!ws.userId) {
      console.log('❌ WS: timeout de autenticação — fechando');
      ws.close(1008, 'Timeout de autenticação');
    }
  }, 10000);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      // ── Autenticação (primeira mensagem) ──────────────────────────────
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

        wsStore.connectedUsers.set(userId, {
          ws,
          name:          userName,
          role:          userRole,
          isOnline:      msg.isOnline !== false,
          lastHeartbeat: new Date(),
          lat:           msg.lat,
          lng:           msg.lng,
        });

        console.log(`✅ WS: autenticado ${userName} (${userRole}) [${userId}]`);
        ws.send(JSON.stringify({ type: 'registered', userId }));

        // Entregar notificações pendentes
        const pending = wsStore.getPendingNotifications(userId);
        if (pending.length > 0) {
          pending.forEach(({ type, payload }) => wsStore.sendToUser(userId, type, payload));
          wsStore.clearPendingNotifications(userId);
          console.log(`📬 ${pending.length} notificações entregues a ${userName}`);
        }
        return;
      }

      // ── Mensagens normais (após autenticação) ─────────────────────────
      const user = wsStore.connectedUsers.get(ws.userId);

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
        console.log(`📡 ${user.name} → isOnline: ${msg.isOnline}`);
      }

    } catch (e) {
      console.error('WS msg inválida:', e.message);
    }
  });

  ws.on('close', (code, reason) => {
    clearTimeout(authTimeout);
    if (ws.userId) {
      const user = wsStore.connectedUsers.get(ws.userId);
      wsStore.connectedUsers.delete(ws.userId);
      console.log(`🔌 WS desconectado: ${user?.name ?? ws.userId} (código: ${code})`);
    }
  });

  ws.on('error', (err) => {
    console.error(`❌ WS erro:`, err.message);
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