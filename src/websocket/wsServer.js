// src/websocket/wsServer.js
// ─────────────────────────────────────────────────────────────────────────────
// WebSocket em tempo real — modelo Yango/Uber
//   • Prestadores transmitem posição a cada 3 s enquanto online
//   • Clientes vêem posições em directo no mapa
//   • Matching: cliente envia pedido → servidor notifica prestadores seleccionados
//   • Prestador aceita/recusa → cliente recebe confirmação instantânea
// ─────────────────────────────────────────────────────────────────────────────

const WebSocket = require('ws');

// ── Armazenamento em memória ─────────────────────────────────────────────────
/** @type {Map<string, { ws: WebSocket, lat: number, lng: number, isOnline: boolean, name: string, role: string }>} */
const connectedUsers = new Map();

/** @type {Map<string, string[]>} requestId → [providerId, …] */
const pendingMatches = new Map();

// ── Helpers ──────────────────────────────────────────────────────────────────
function send(ws, type, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function broadcast(type, payload, filter = () => true) {
  connectedUsers.forEach(({ ws }, id) => {
    if (filter(id)) send(ws, type, payload);
  });
}

function getOnlineProviders() {
  const providers = [];
  connectedUsers.forEach((data, id) => {
    if (data.role === 'provider' && data.isOnline) {
      providers.push({
        id,
        name: data.name,
        lat: data.lat,
        lng: data.lng,
        isOnline: true,
      });
    }
  });
  return providers;
}

// ── Setup ────────────────────────────────────────────────────────────────────
/**
 * Anexa o servidor WebSocket a um httpServer Express existente.
 * @param {import('http').Server} httpServer
 */
function setupWebSocket(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    let userId = null;

    console.log(`🔌 Nova conexão WS de ${ip}`);

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      switch (msg.type) {
        // ── 1. Registo do utilizador ────────────────────────────────────────
        case 'register': {
          userId = msg.userId;
          connectedUsers.set(userId, {
            ws,
            lat: msg.lat ?? -25.9692,
            lng: msg.lng ?? 32.5732,
            isOnline: msg.role === 'provider' ? (msg.isOnline ?? true) : true,
            name: msg.name ?? 'Utilizador',
            role: msg.role ?? 'client',
          });

          console.log(`✅ WS registado: ${msg.name} (${msg.role}) — ${userId}`);

          // Confirmar registo
          send(ws, 'registered', { userId });

          // Se for cliente, enviar lista de prestadores online imediatamente
          if (msg.role === 'client') {
            send(ws, 'providers_snapshot', { providers: getOnlineProviders() });
          }

          // Notificar outros clientes que um novo prestador ficou online
          if (msg.role === 'provider' && msg.isOnline !== false) {
            broadcast(
              'provider_online',
              {
                provider: {
                  id: userId,
                  name: msg.name,
                  lat: msg.lat ?? -25.9692,
                  lng: msg.lng ?? 32.5732,
                },
              },
              (id) => connectedUsers.get(id)?.role === 'client'
            );
          }
          break;
        }

        // ── 2. Actualização de posição (prestador) ──────────────────────────
        case 'location_update': {
          if (!userId) break;
          const user = connectedUsers.get(userId);
          if (!user) break;

          user.lat = msg.lat;
          user.lng = msg.lng;

          // Transmitir apenas a clientes conectados
          broadcast(
            'provider_location',
            { providerId: userId, lat: msg.lat, lng: msg.lng },
            (id) => connectedUsers.get(id)?.role === 'client'
          );
          break;
        }

        // ── 3. Toggle online/offline (prestador) ───────────────────────────
        case 'set_online_status': {
          if (!userId) break;
          const user = connectedUsers.get(userId);
          if (!user) break;

          user.isOnline = msg.isOnline;
          console.log(`🔵 ${user.name} ficou ${msg.isOnline ? 'ONLINE' : 'OFFLINE'}`);

          broadcast(
            msg.isOnline ? 'provider_online' : 'provider_offline',
            {
              provider: {
                id: userId,
                name: user.name,
                lat: user.lat,
                lng: user.lng,
              },
            },
            (id) => connectedUsers.get(id)?.role === 'client'
          );
          break;
        }

        // ── 4. Cliente envia pedido de serviço ─────────────────────────────
        case 'service_request': {
          if (!userId) break;
          const { requestId, selectedProviderIds, serviceName, clientName, location } = msg;

          pendingMatches.set(requestId, selectedProviderIds ?? []);

          // Notificar cada prestador seleccionado
          (selectedProviderIds ?? []).forEach((providerId) => {
            const providerData = connectedUsers.get(providerId);
            if (providerData) {
              send(providerData.ws, 'new_request', {
                requestId,
                clientId: userId,
                clientName,
                serviceName,
                location,
              });
              console.log(`📤 Pedido ${requestId} enviado a ${providerData.name}`);
            }
          });
          break;
        }

        // ── 5. Prestador responde ao pedido ────────────────────────────────
        case 'request_response': {
          if (!userId) break;
          const { requestId, accepted } = msg;

          // Encontrar o cliente que fez o pedido
          connectedUsers.forEach((data, id) => {
            if (data.role === 'client') {
              send(data.ws, 'provider_response', {
                requestId,
                providerId: userId,
                providerName: connectedUsers.get(userId)?.name ?? 'Prestador',
                accepted,
              });
            }
          });

          if (accepted) {
            // Notificar outros prestadores seleccionados que o pedido foi aceite
            const others = pendingMatches.get(requestId) ?? [];
            others.forEach((pid) => {
              if (pid !== userId) {
                const pd = connectedUsers.get(pid);
                if (pd) send(pd.ws, 'request_taken', { requestId });
              }
            });
            pendingMatches.delete(requestId);
          }

          console.log(`${accepted ? '✅' : '❌'} Prestador ${userId} ${accepted ? 'aceitou' : 'recusou'} pedido ${requestId}`);
          break;
        }

        // ── 6. Ping/pong heartbeat ──────────────────────────────────────────
        case 'ping':
          send(ws, 'pong', {});
          break;
      }
    });

    ws.on('close', () => {
      if (userId) {
        const user = connectedUsers.get(userId);
        if (user?.role === 'provider') {
          broadcast(
            'provider_offline',
            { provider: { id: userId } },
            (id) => connectedUsers.get(id)?.role === 'client'
          );
        }
        connectedUsers.delete(userId);
        console.log(`🔴 Desconectado: ${userId}`);
      }
    });

    ws.on('error', (err) => console.error('WS erro:', err.message));
  });

  console.log('🔌 WebSocket server activo em /ws');
  return wss;
}

module.exports = { setupWebSocket };