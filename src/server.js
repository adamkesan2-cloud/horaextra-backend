// backend/src/server.js
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
}
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const app = express();

// Detectar ambiente
const isVercel = process.env.VERCEL === '1';
const isProduction = process.env.NODE_ENV === 'production';

// Uploads - usar /tmp no Vercel
const uploadsDir = isVercel ? '/tmp/uploads' : path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// ============================================
// CORS CONFIGURADO CORRETAMENTE
// ============================================
const allowedOrigins = [
  'https://horaextra-app.vercel.app',
  'https://horaextra-app-git-main.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  /\.vercel\.app$/,
];

const corsOptions = {
  origin: function(origin, callback) {
    // Permitir requisições sem origin (como mobile apps)
    if (!origin) return callback(null, true);
    
    // Verificar se a origem é permitida
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });
    
    if (isAllowed || isProduction === false) {
      callback(null, true);
    } else {
      console.log(`❌ CORS bloqueado: ${origin}`);
      callback(new Error('CORS blocked'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Total-Count'],
  maxAge: 86400,
};

// Aplicar CORS
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Fallback CORS para garantir
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  next();
});

app.use(helmet({ 
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rotas de diagnóstico
app.get('/', (req, res) => res.json({ success: true, message: 'API HoraExtra funcionando!' }));
app.get('/api/health', (req, res) => res.json({ 
  status: 'OK', 
  timestamp: new Date(), 
  environment: process.env.NODE_ENV,
  vercel: isVercel
}));

// Funções auxiliares de rota
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function generateStraightLine(lat1, lon1, lat2, lon2, points = 21) {
  const result = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    result.push({
      lat: lat1 + (lat2 - lat1) * t,
      lng: lon1 + (lon2 - lon1) * t
    });
  }
  return result;
}

function routeFallback(fromLat, fromLng, toLat, toLng) {
  const distance = haversineDistance(fromLat, fromLng, toLat, toLng);
  return {
    distanceKm: distance,
    durationMin: distance * 3,
    points: generateStraightLine(fromLat, fromLng, toLat, toLng),
    fallback: true
  };
}

// Rota de rota - /api/route
app.get('/api/route', async (req, res) => {
  const { fromLat, fromLng, toLat, toLng } = req.query;
  
  if (!fromLat || !fromLng || !toLat || !toLng) {
    return res.status(400).json({ 
      error: 'Parâmetros obrigatórios: fromLat, fromLng, toLat, toLng',
      example: '/api/route?fromLat=-25.9692&fromLng=32.5732&toLat=-25.9655&toLng=32.5832'
    });
  }

  const [fLat, fLng, tLat, tLng] = [fromLat, fromLng, toLat, toLng].map(parseFloat);
  
  try {
    const https = require('https');
    const url = `https://router.project-osrm.org/route/v1/driving/${fLng},${fLat};${tLng},${tLat}?overview=full&geometries=polyline`;
    
    const data = await new Promise((resolve, reject) => {
      const request = https.get(url, { timeout: 8000 }, (response) => {
        let body = '';
        response.on('data', chunk => body += chunk);
        response.on('end', () => {
          try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
        });
      });
      request.on('error', reject);
      request.on('timeout', () => { request.destroy(); reject(new Error('timeout')); });
    });
    
    const route = data.routes?.[0];
    if (!route) {
      return res.json(routeFallback(fLat, fLng, tLat, tLng));
    }
    
    const polyline = require('@mapbox/polyline');
    const decodedPoints = polyline.decode(route.geometry);
    const points = decodedPoints.map(p => ({ lat: p[0], lng: p[1] }));
    
    return res.json({ 
      distanceKm: route.distance / 1000, 
      durationMin: route.duration / 60, 
      points: points,
      polyline: route.geometry
    });
  } catch (error) {
    console.error('❌ Erro OSRM:', error.message);
    return res.json(routeFallback(fLat, fLng, tLat, tLng));
  }
});

// Rota alternativa
app.get('/route', async (req, res) => {
  const { fromLat, fromLng, toLat, toLng } = req.query;
  if (!fromLat || !fromLng || !toLat || !toLng) {
    return res.status(400).json({ error: 'Parâmetros inválidos' });
  }
  
  try {
    const https = require('https');
    const [fLat, fLng, tLat, tLng] = [fromLat, fromLng, toLat, toLng].map(parseFloat);
    const url = `https://router.project-osrm.org/route/v1/driving/${fLng},${fLat};${tLng},${tLat}?overview=full&geometries=polyline`;
    
    const data = await new Promise((resolve, reject) => {
      const request = https.get(url, { timeout: 8000 }, (response) => {
        let body = '';
        response.on('data', chunk => body += chunk);
        response.on('end', () => {
          try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
        });
      });
      request.on('error', reject);
      request.on('timeout', () => { request.destroy(); reject(new Error('timeout')); });
    });
    
    const route = data.routes?.[0];
    if (!route) {
      return res.json(routeFallback(fLat, fLng, tLat, tLng));
    }
    
    const polyline = require('@mapbox/polyline');
    const decodedPoints = polyline.decode(route.geometry);
    const points = decodedPoints.map(p => ({ lat: p[0], lng: p[1] }));
    
    return res.json({ 
      distanceKm: route.distance / 1000, 
      durationMin: route.duration / 60, 
      points: points
    });
  } catch (error) {
    console.error('❌ Erro rota alternativa:', error.message);
    return res.json(routeFallback(parseFloat(fromLat), parseFloat(fromLng), parseFloat(toLat), parseFloat(toLng)));
  }
});

// Rotas da API
const routes = require('./routes');
app.use('/api', routes);

// 404
app.use((req, res) => res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` }));

// Error handler
app.use((err, req, res, next) => {
  console.error('❌', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
});

// Exportar para Vercel ou iniciar servidor
const { sequelize } = require('./config/database');

if (isVercel) {
  // Para Vercel, apenas exportar (WebSocket não suportado)
  console.log('📦 Modo Vercel - WebSocket não disponível');
  sequelize.authenticate()
    .then(() => console.log('✅ DB conectado (Vercel)'))
    .catch(err => console.error('❌ Erro DB:', err.message));
  
  module.exports = app;
} else {
  // Desenvolvimento local ou Railway - iniciar servidor com WebSocket
  const http = require('http');
  const server = http.createServer(app);
  
  // WebSocket apenas em ambiente não-Vercel
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ server, path: '/ws' });
  const wsStore = require('./wsStore');
  const { connectedUsers, pendingMatches, pendingNotifications } = wsStore;
  
  function wsSend(ws, type, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type, ...payload }));
        return true;
      } catch (err) {
        console.error(`❌ Erro ao enviar WS: ${err.message}`);
        return false;
      }
    }
    return false;
  }
  
  function wsBroadcast(type, payload, filter = () => true) {
    let count = 0;
    connectedUsers.forEach(({ ws }, id) => {
      if (filter(id) && wsSend(ws, type, payload)) count++;
    });
    return count;
  }
  
  function getOnlineProviders() {
    const list = [];
    connectedUsers.forEach((d, id) => {
      if (d.role === 'provider' && d.isOnline)
        list.push({ id, name: d.name, lat: d.lat, lng: d.lng, isOnline: true });
    });
    return list;
  }
  
  // Função para enviar notificações pendentes
  function flushPendingNotifications(userId) {
    const pending = pendingNotifications?.get(userId);
    if (pending && pending.length > 0) {
      console.log(`📦 Enviando ${pending.length} notificações pendentes para ${userId}`);
      const user = connectedUsers.get(userId);
      if (user && user.ws) {
        pending.forEach(notif => {
          wsSend(user.ws, notif.type, notif.payload);
        });
        pendingNotifications.delete(userId);
      }
      return true;
    }
    return false;
  }
  
  wss.on('connection', (ws) => {
    let userId = null;
    console.log('🔌 Nova conexão WebSocket estabelecida');
    
    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); }
      catch { console.log('⚠️ Mensagem WS inválida:', raw); return; }
      
      console.log(`📨 WS recebido: ${msg.type} de ${msg.userId || 'unknown'}`);
      
      switch (msg.type) {
        case 'register':
          userId = msg.userId;
          connectedUsers.set(userId, {
            ws, name: msg.name ?? 'User', role: msg.role ?? 'client',
            lat: msg.lat ?? -25.9692, lng: msg.lng ?? 32.5732,
            isOnline: msg.role === 'provider' ? (msg.isOnline ?? true) : true,
            connectedAt: new Date(),
            lastHeartbeat: new Date()
          });
          console.log(`🔌 ${msg.name} (${msg.role}) conectado [${userId}]`);
          wsSend(ws, 'registered', { userId });
          
          // Enviar notificações pendentes
          flushPendingNotifications(userId);
          
          if (msg.role === 'provider') {
            try {
              const { ServiceRequest, User, Service } = require('./models');
              const { Op } = require('sequelize');
              const pendingRequests = await ServiceRequest.findAll({
                where: { 
                  status: { [Op.in]: ['pending', 'providers_selected'] }, 
                  selected_providers: { [Op.contains]: [userId] } 
                },
                include: [
                  { model: Service, as: 'service', attributes: ['id', 'name', 'price'] },
                  { model: User, as: 'client', attributes: ['id', 'name', 'phone', 'photo_url', 'latitude', 'longitude'] },
                ],
                order: [['created_at', 'DESC']]
              });
              if (pendingRequests.length > 0) {
                wsSend(ws, 'pending_requests', { requests: pendingRequests });
                console.log(`📦 Enviados ${pendingRequests.length} pedidos pendentes para ${msg.name}`);
              }
            } catch (err) { console.error('Erro ao buscar pedidos pendentes:', err); }
          }
          
          if (msg.role === 'client') {
            wsSend(ws, 'providers_snapshot', { providers: getOnlineProviders() });
            console.log(`📸 Snapshot enviado para cliente ${msg.name}`);
          }
          
          if (msg.role === 'provider' && msg.isOnline !== false) {
            const notified = wsBroadcast('provider_online',
              { provider: { id: userId, name: msg.name, lat: msg.lat, lng: msg.lng } },
              (id) => connectedUsers.get(id)?.role === 'client');
            console.log(`🟢 Prestador ${msg.name} online - notificados ${notified} clientes`);
          }
          break;
          
        case 'location_update':
          if (!userId) break;
          const u = connectedUsers.get(userId);
          if (!u) break;
          u.lat = msg.lat;
          u.lng = msg.lng;
          u.lastHeartbeat = new Date();
          const notifiedLoc = wsBroadcast('provider_location',
            { providerId: userId, lat: msg.lat, lng: msg.lng, providerName: u.name },
            (id) => connectedUsers.get(id)?.role === 'client');
          console.log(`📍 ${u.name} atualizou localização - notificados ${notifiedLoc} clientes`);
          break;
          
        case 'set_online_status':
          if (!userId) break;
          const user = connectedUsers.get(userId);
          if (!user || user.role !== 'provider') break;
          user.isOnline = msg.isOnline;
          user.lastHeartbeat = new Date();
          console.log(`🔵 ${user.name} ficou ${msg.isOnline ? 'ONLINE ✅' : 'OFFLINE ❌'}`);
          const notifiedStatus = wsBroadcast(msg.isOnline ? 'provider_online' : 'provider_offline',
            { provider: { id: userId, name: user.name, lat: user.lat, lng: user.lng } },
            (id) => connectedUsers.get(id)?.role === 'client');
          console.log(`📢 ${notifiedStatus} clientes notificados sobre ${msg.isOnline ? 'online' : 'offline'}`);
          break;
          
        case 'service_request': {
          if (!userId) break;
          const { requestId, selectedProviderIds = [], serviceName, clientName, location, budget, observations, isUrgent } = msg;
          console.log(`📢 NOVO PEDIDO ${requestId} do cliente ${clientName}`);
          const notified = wsStore.notifyNewRequest({
            requestId, 
            clientId: userId, 
            clientName, 
            serviceName, 
            location, 
            selectedProviderIds,
            budget,
            observations,
            isUrgent
          });
          console.log(`📊 ${notified}/${selectedProviderIds.length} prestadores notificados via WS`);
          break;
        }
        
        case 'request_response': {
          if (!userId) break;
          const { requestId, accepted } = msg;
          const providerName = connectedUsers.get(userId)?.name ?? 'Prestador';
          const providerLat = connectedUsers.get(userId)?.lat;
          const providerLng = connectedUsers.get(userId)?.lng;
          console.log(`📞 Resposta do prestador ${providerName}: ${accepted ? 'ACEITOU ✅' : 'RECUSOU ❌'} pedido ${requestId}`);
          wsStore.notifyRequestResponse({ 
            requestId, 
            providerId: userId, 
            providerName, 
            accepted,
            providerLat,
            providerLng,
            message: accepted ? `${providerName} aceitou seu pedido!` : `${providerName} recusou o pedido.`
          });
          break;
        }
        
        case 'service_completed': {
          if (!userId) break;
          const { requestId, rating, review } = msg;
          const clientName = connectedUsers.get(userId)?.name ?? 'Cliente';
          console.log(`✅ Cliente ${clientName} concluiu serviço ${requestId}`);
          
          try {
            const { ServiceRequest } = require('./models');
            const request = await ServiceRequest.findByPk(requestId);
            if (request && request.provider_id) {
              wsStore.notifyServiceCompleted({
                requestId,
                clientId: userId,
                clientName,
                providerId: request.provider_id,
                providerName: null,
                rating,
                review
              });
            }
          } catch (err) {
            console.error('Erro ao processar conclusão:', err);
          }
          break;
        }
        
        case 'new_message': {
          if (!userId) break;
          const { toId, message, requestId } = msg;
          const fromName = connectedUsers.get(userId)?.name ?? 'Usuário';
          console.log(`💬 Mensagem de ${fromName} para ${toId}`);
          wsStore.sendMessage({
            fromId: userId,
            fromName,
            toId,
            message,
            requestId
          });
          break;
        }
        
        case 'rate_provider': {
          if (!userId) break;
          const { providerId, rating, review, requestId } = msg;
          const clientName = connectedUsers.get(userId)?.name ?? 'Cliente';
          console.log(`⭐ Avaliação ${rating}⭐ para prestador ${providerId}`);
          wsStore.notifyProviderRating({
            providerId,
            clientId: userId,
            clientName,
            rating,
            review,
            requestId
          });
          break;
        }
        
        case 'ping':
          if (userId) {
            const userHeartbeat = connectedUsers.get(userId);
            if (userHeartbeat) userHeartbeat.lastHeartbeat = new Date();
          }
          wsSend(ws, 'pong', { timestamp: new Date().toISOString() });
          break;
          
        default:
          console.log(`⚠️ WS: tipo desconhecido: ${msg.type}`);
      }
    });
    
    ws.on('close', () => {
      if (userId) {
        const u = connectedUsers.get(userId);
        if (u) {
          console.log(`🔴 WS desconectado: ${u.name} (${userId}) - role: ${u.role}`);
          if (u.role === 'provider') {
            const notified = wsBroadcast('provider_offline',
              { provider: { id: userId, name: u.name } },
              (id) => connectedUsers.get(id)?.role === 'client');
            console.log(`📢 ${notified} clientes notificados sobre offline`);
          }
        }
        connectedUsers.delete(userId);
        console.log(`📊 Usuários restantes conectados: ${connectedUsers.size}`);
      }
    });
    
    ws.on('error', (e) => console.error('❌ WS erro:', e.message));
  });
  
  // Heartbeat check a cada 30 segundos
  setInterval(() => {
    const now = new Date();
    const timeout = 30000;
    connectedUsers.forEach((data, id) => {
      if (now - data.lastHeartbeat > timeout) {
        console.log(`⏰ Heartbeat timeout para usuário ${id}, desconectando...`);
        const ws = data.ws;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        connectedUsers.delete(id);
      }
    });
  }, 30000);
  
  const PORT = process.env.PORT || 4000;
  sequelize.authenticate()
    .then(() => {
      console.log('✅ Banco de dados conectado');
      return sequelize.sync({ alter: false });
    })
    .then(() => {
      console.log('✅ Modelos sincronizados');
      server.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
        console.log(`🔌 WebSocket em ws://localhost:${PORT}/ws`);
        console.log(`🗺️ Rota OSRM em http://localhost:${PORT}/api/route`);
        console.log(`❤️ Health check em http://localhost:${PORT}/api/health\n`);
      });
    })
    .catch(err => {
      console.error('❌ Erro fatal:', err.message);
      process.exit(1);
    });
}