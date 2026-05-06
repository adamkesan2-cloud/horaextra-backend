// backend/src/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const multer = require('multer');

// ✅ memoryStorage — funciona na Vercel e Flutter Web (sem ficheiros temporários)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

console.log('✅ authController importado:', Object.keys(authController));

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/logout', authController.logout);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);
router.post('/refresh-token', authController.refreshToken);

router.post('/register-provider',
  upload.fields([
    { name: 'id_document', maxCount: 1 },
    { name: 'cv', maxCount: 1 },
  ]),
  authController.registerProvider
);

module.exports = router;
