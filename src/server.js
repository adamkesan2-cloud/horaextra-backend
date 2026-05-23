// backend/src/server.js - VERSÃO CORRIGIDA PARA VERCEL
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

console.log(`🚀 Iniciando servidor em modo: ${isVercel ? 'VERCEL' : 'LOCAL/RAILWAY'}`);

// Uploads - usar /tmp no Vercel
const uploadsDir = isVercel ? '/tmp/uploads' : path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// ============================================
// CORS - CONFIGURAÇÃO AGRESSIVA
// ============================================
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

app.use(cors({ origin: '*', credentials: true }));
app.use(helmet({ 
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false 
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rotas de diagnóstico (essenciais para testar)
app.get('/', (req, res) => res.json({ success: true, message: 'API HoraExtra funcionando!' }));
app.get('/api/health', (req, res) => res.json({ 
  status: 'OK', 
  timestamp: new Date(), 
  environment: process.env.NODE_ENV,
  vercel: isVercel,
  uptime: process.uptime()
}));
app.get('/api/test-cors', (req, res) => res.json({ message: 'CORS funcionando!', timestamp: new Date() }));

// Funções auxiliares
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

// Rota de rota
app.get('/api/route', async (req, res) => {
  const { fromLat, fromLng, toLat, toLng } = req.query;
  
  if (!fromLat || !fromLng || !toLat || !toLng) {
    return res.status(400).json({ 
      error: 'Parâmetros obrigatórios: fromLat, fromLng, toLat, toLng'
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

// Importar e usar rotas
try {
  const routes = require('./routes');
  app.use('/api', routes);
  console.log('✅ Rotas da API carregadas');
} catch (err) {
  console.error('❌ Erro ao carregar rotas:', err.message);
}

// 404 handler
app.use((req, res) => {
  console.log(`⚠️ Rota não encontrada: ${req.method} ${req.path}`);
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Erro:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
});

const { sequelize } = require('./config/database');

// Para Vercel, apenas conectar e exportar app
if (isVercel) {
  console.log('📦 Modo Vercel - Conectando ao banco...');
  
  sequelize.authenticate()
    .then(() => {
      console.log('✅ Banco de dados conectado (Vercel)');
      return sequelize.sync({ alter: false });
    })
    .then(() => {
      console.log('✅ Modelos sincronizados (Vercel)');
      console.log('🚀 App pronto para receber requisições');
    })
    .catch(err => {
      console.error('❌ Erro DB (Vercel):', err.message);
    });
  
  // Exportar app para Vercel
  module.exports = app;
} else {
  // Modo local/Railway com WebSocket
  const http = require('http');
  const server = http.createServer(app);
  
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ server, path: '/ws' });
  const wsStore = require('./wsStore');
  
  // ... resto do código WebSocket (manter igual ao anterior)
  
  const PORT = process.env.PORT || 4000;
  sequelize.authenticate()
    .then(() => {
      console.log('✅ Banco de dados conectado');
      return sequelize.sync({ alter: false });
    })
    .then(() => {
      server.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
      });
    })
    .catch(err => {
      console.error('❌ Erro fatal:', err.message);
      process.exit(1);
    });
}