// backend/routes/upload.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authMiddleware } = require('../middlewares/auth');
const path = require('path');
const fs = require('fs');

// Configurar armazenamento em disco para imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'image-' + unique + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas'), false);
    }
  }
});

router.post('/image', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const imageUrl = `/uploads/${req.file.filename}`;

    res.json({
      success: true,
      message: 'Upload realizado com sucesso',
      data: {
        url: imageUrl,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('❌ Erro no upload:', error);
    res.status(500).json({ error: 'Erro ao fazer upload' });
  }
});

module.exports = router;