// app.js — configuração Express partilhada (Vercel + Railway)
// NÃO arranca servidor aqui. Apenas configura middlewares, rotas e DB.
require('pg');
require('pg-hstore');

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');
const fs      = require('fs');

const app = express();
app.set('trust proxy', 1);

// ─── Ambiente ─────────────────────────────────────────────────────────────────
// VERCEL=1  → Vercel serverless
// else      → Railway ou local (ambos usam listen())
const isVercel = process.env.VERCEL === '1';
const isProd   = process.env.NODE_ENV === 'production';
const isLocal  = !isProd;

// ─── Uploads ──────────────────────────────────────────────────────────────────
const uploadsDir = isVercel
  ? '/tmp/uploads'
  : path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Uploads:', uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

// ─── CORS ─────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin)                          return cb(null, true); // mobile / Postman
    if (origin.includes('localhost'))     return cb(null, true);
    if (origin.includes('127.0.0.1'))     return cb(null, true);
    if (origin.includes('vercel.app'))    return cb(null, true);
    if (origin.includes('railway.app'))   return cb(null, true);
    console.warn('⚠️  CORS origem desconhecida (aceite):', origin);
    return cb(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 204,
};

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(morgan(isLocal ? 'dev' : 'combined'));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limit apenas no Vercel (Railway tem controlo próprio)
if (isVercel) {
  const rateLimit = require('express-rate-limit');
  app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Tente novamente mais tarde.' },
  }));
}

// ─── Rotas sem DB ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({
  success: true,
  message: 'API HoraExtra funcionando!',
  timestamp: new Date(),
  environment: process.env.NODE_ENV,
  platform: isVercel ? 'vercel' : (isProd ? 'railway' : 'local'),
}));

app.get('/api/health', (req, res) => res.json({
  status: 'OK',
  timestamp: new Date(),
  environment: process.env.NODE_ENV,
  platform: isVercel ? 'vercel' : (isProd ? 'railway' : 'local'),
  database: process.env.DATABASE_URL || process.env.DB_HOST ? 'configured' : 'not configured',
}));

// ─── DB (lazy, com cache) ─────────────────────────────────────────────────────
let dbInitialized = false;
let dbError       = null;
let initPromise   = null;

async function initDB() {
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

// ─── Diagnóstico ──────────────────────────────────────────────────────────────
app.get('/api/diag', async (req, res) => {
  await initDB();
  const mods = ['pg', 'sequelize', './src/config/database', './src/models', './src/routes'];
  const tests = {};
  for (const mod of mods) {
    try { require(mod); tests[mod] = 'OK'; }
    catch (e) { tests[mod] = 'ERRO: ' + e.message; }
  }
  res.json({
    modules: tests,
    dbInitialized,
    dbError,
    uploadsDir,
    uploadsDirExists: fs.existsSync(uploadsDir),
    env: {
      isVercel,
      isProd,
      NODE_ENV:  process.env.NODE_ENV,
      hasDBUrl:  !!process.env.DATABASE_URL,
      hasDBHost: !!process.env.DB_HOST,
    },
  });
});

// ─── Middleware DB para rotas /api ────────────────────────────────────────────
app.use('/api', async (req, res, next) => {
  // Rotas sem DB (health e diag já responderam acima)
  if (['/api/health', '/api/diag'].includes(req.path)) return next();

  await initDB();
  if (!dbInitialized) {
    return res.status(503).json({
      error: 'Banco de dados não disponível',
      detail: dbError,
    });
  }
  next();
});

// ─── Rotas da aplicação ───────────────────────────────────────────────────────
const routes = require('./src/routes');
app.use('/api', routes);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(err.status || 500).json({
    error: isLocal ? err.message : 'Erro interno do servidor',
  });
});

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = app;
module.exports.initDB = initDB; // usado por src/server.js para pré-aquecer o DB