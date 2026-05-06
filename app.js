// backend/app.js
require('dotenv').config();
require('pg');
require('pg-hstore');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
app.set('trust proxy', 1);

// Pasta de uploads (só em desenvolvimento)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Pasta uploads criada');
}
app.use('/uploads', express.static(uploadsDir));

// Middlewares
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(morgan('combined'));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições.' },
}));

// Rotas básicas (sem DB)
app.get('/', (req, res) => res.json({ success: true, message: 'API HoraExtra funcionando!', timestamp: new Date() }));
app.get('/api', (req, res) => res.json({ success: true, message: 'API HoraExtra funcionando!', timestamp: new Date() }));
app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

// Inicialização do DB
let dbInitialized = false;
let dbError = null;
let initPromise = null;

function initDB() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const { sequelize } = require('./src/config/database');
      await sequelize.authenticate();
      console.log('✅ DB conectado');
      await sequelize.sync({ alter: false });
      console.log('✅ DB sincronizado');
      dbInitialized = true;
    } catch (err) {
      dbError = err.message;
      console.error('❌ Erro DB:', err.message);
    }
  })();
  return initPromise;
}

// Diagnóstico
app.get('/api/diag', async (req, res) => {
  await initDB();
  const tests = {};
  for (const mod of ['pg', 'sequelize', './src/config/database', './src/models', './src/routes']) {
    try { require(mod); tests[mod] = 'OK'; }
    catch (e) { tests[mod] = 'ERRO: ' + e.message; }
  }
  res.json({ ...tests, dbInitialized, dbError, uploadsDir, uploadsDirExists: fs.existsSync(uploadsDir) });
});

// ✅ Rotas da API — carregadas UMA VEZ, não dentro de middleware
const routes = require('./src/routes');

app.use('/api', async (req, res, next) => {
  await initDB();
  if (!dbInitialized) {
    return res.status(503).json({ error: 'DB não conectado', detail: dbError });
  }
  next();
});

app.use('/api', routes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno do servidor',
  });
});

module.exports = app;