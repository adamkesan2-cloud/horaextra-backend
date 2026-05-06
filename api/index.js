const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Rota de health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Rotas básicas para teste
app.get('/api/categories', (req, res) => {
  res.json({ success: true, data: [] });
});

app.get('/api/services', (req, res) => {
  res.json({ success: true, data: [] });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  res.json({ 
    success: false, 
    message: 'Backend funcionando! Configure o banco de dados.',
    email 
  });
});

// Rota padrão
app.get('*', (req, res) => {
  res.json({ message: 'API HoraExtra funcionando!' });
});

module.exports = app;