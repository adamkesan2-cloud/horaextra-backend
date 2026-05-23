// src/server.js — entry point Railway + desenvolvimento local
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
}
const http    = require('http');
const app     = require('../app');
const wsStore = require('./wsStore');
const server  = http.createServer(app);
const PORT    = process.env.PORT || 4000;

// LISTEN IMEDIATO — healthcheck Railway passa antes do DB sync
server.listen(PORT, '0.0.0.0', () => {
  console.log(`SERVIDOR_INICIADO na porta ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});

// DB em background
const { initDB } = require('../app');
initDB().then(() => console.log('DB pronto')).catch(e => console.error('DB erro:', e.message));