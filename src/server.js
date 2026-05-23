// backend/src/server-simple.js - Versão simplificada que vai funcionar
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
}
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// CORS - liberado para todos
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(cors());
app.use(express.json());

// Rotas básicas de teste
app.get('/', (req, res) => {
  res.json({ message: 'API HoraExtra funcionando!', timestamp: new Date() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

app.post('/api/auth/login', (req, res) => {
  console.log('Login request:', req.body);
  res.json({ 
    success: true, 
    token: 'fake-token-123',
    user: { 
      id: 1, 
      name: 'Usuário Teste', 
      email: req.body.email,
      role: 'client'
    }
  });
});

app.post('/api/auth/register', (req, res) => {
  res.json({ success: true, message: 'Usuário registrado com sucesso' });
});

app.get('/api/services', (req, res) => {
  res.json({
    success: true,
    services: [
      { id: 1, name: 'Limpeza', price: 500, category: 'Limpeza' },
      { id: 2, name: 'Eletricista', price: 800, category: 'Reparos' },
      { id: 3, name: 'Encanador', price: 700, category: 'Reparos' }
    ]
  });
});

app.get('/api/categories', (req, res) => {
  res.json({
    success: true,
    categories: [
      { id: 1, name: 'Limpeza', icon: '🧹' },
      { id: 2, name: 'Reparos', icon: '🔧' },
      { id: 3, name: 'Jardinagem', icon: '🌿' }
    ]
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
});