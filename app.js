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

// Detectar ambiente
const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

// Pasta de uploads (Vercel usa /tmp)
const uploadsDir = isVercel ? '/tmp/uploads' : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Pasta uploads criada:', uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

// CORS configurado para produção
const allowedOrigins = [
  'https://horaextra-amber.vercel.app',
  'https://horaextra.vercel.app',
  'https://horaextra-app.vercel.app',
  'https://horaextra-app-git-main-adam-kesans-projects.vercel.app',
  'http://localhost:3000',
  'http://localhost:4000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4000',
  'http://localhost:5000',
  'https://horaextra-backend-production.up.railway.app'
];

const corsOptions = {
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      callback(null, true);
    } else {
      console.log('⚠️ CORS bloqueado para:', origin);
      callback(null, true);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 204,
};

// Middlewares
app.use(helmet({ 
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));
app.use(morgan('combined'));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limit apenas em produção
if (isVercel) {
  app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Tente novamente mais tarde.' },
  }));
}

// Rotas básicas (sem DB)
app.get('/', (req, res) => res.json({ 
  success: true, 
  message: 'API HoraExtra funcionando!', 
  timestamp: new Date(),
  environment: process.env.NODE_ENV
}));

app.get('/api/health', (req, res) => res.json({ 
  status: 'OK', 
  timestamp: new Date(),
  environment: process.env.NODE_ENV,
  database: process.env.DATABASE_URL ? 'configured' : 'not configured'
}));

// Inicialização do DB (lazy loading)
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
  const modules = ['pg', 'sequelize', './src/config/database', './src/models', './src/routes'];
  for (const mod of modules) {
    try { 
      require(mod); 
      tests[mod] = 'OK'; 
    } catch (e) { 
      tests[mod] = 'ERRO: ' + e.message; 
    }
  }
  res.json({ 
    ...tests, 
    dbInitialized, 
    dbError, 
    uploadsDir, 
    uploadsDirExists: fs.existsSync(uploadsDir),
    isVercel,
    nodeEnv: process.env.NODE_ENV
  });
});

// Middleware de DB para rotas da API
app.use('/api', async (req, res, next) => {
  await initDB();
  if (!dbInitialized) {
    return res.status(503).json({ error: 'DB não conectado', detail: dbError });
  }
  next();
});

// Rotas da API
const routes = require('./src/routes');
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