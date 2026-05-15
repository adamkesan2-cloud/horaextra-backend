// backend/api/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { sequelize } = require('../src/config/database');

const app = express();

// CORS para Vercel
app.use(cors({ 
  origin: '*', 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/', (req, res) => res.json({ 
  success: true, 
  message: 'API HoraExtra na Vercel',
  timestamp: new Date(),
  websocket: false,
  note: 'WebSocket não disponível na Vercel. Use polling.'
}));

app.get('/api/health', (req, res) => res.json({ 
  status: 'OK', 
  timestamp: new Date(),
  environment: 'vercel',
  websocket: false
}));

// Rota de rota (OSRM)
app.get('/api/route', async (req, res) => {
  const { fromLat, fromLng, toLat, toLng } = req.query;
  if (!fromLat || !fromLng || !toLat || !toLng) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios' });
  }

  const [fLat, fLng, tLat, tLng] = [fromLat, fromLng, toLat, toLng].map(parseFloat);

  try {
    const https = require('https');
    const url = `https://router.project-osrm.org/route/v1/driving/${fLng},${fLat};${tLng},${tLat}?overview=full&geometries=polyline`;

    const data = await new Promise((resolve, reject) => {
      https.get(url, { timeout: 8000 }, (resp) => {
        let body = '';
        resp.on('data', (chunk) => (body += chunk));
        resp.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });

    const route = data.routes?.[0];
    if (!route) throw new Error('No route found');

    const polyline = require('@mapbox/polyline');
    const points = polyline.decode(route.geometry).map((p) => ({ lat: p[0], lng: p[1] }));

    res.json({
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
      points,
    });
  } catch {
    // Fallback: linha recta
    const R = 6371;
    const dLat = ((tLat - fLat) * Math.PI) / 180;
    const dLon = ((tLng - fLng) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos((fLat * Math.PI) / 180) *
      Math.cos((tLat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
    const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const points = Array.from({ length: 11 }, (_, i) => ({
      lat: fLat + ((tLat - fLat) * i) / 10,
      lng: fLng + ((tLng - fLng) * i) / 10,
    }));
    res.json({ distanceKm: distance, durationMin: distance * 3, points, fallback: true });
  }
});

// Middleware para conectar DB antes das rotas
app.use(async (req, res, next) => {
  try {
    if (!global.dbConnected) {
      await sequelize.authenticate();
      await sequelize.sync({ alter: false });
      global.dbConnected = true;
      console.log('✅ DB conectado na Vercel');
    }
    next();
  } catch (err) {
    console.error('❌ DB error:', err.message);
    next();
  }
});

// Rotas da API
const routes = require('../src/routes');
app.use('/api', routes);

// 404
app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('❌', err.message);
  res.status(500).json({ error: err.message || 'Erro interno' });
});

module.exports = app;