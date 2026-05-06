// backend/src/routes/index.js
const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const userRoutes = require('./user');
const categoryRoutes = require('./category');
const serviceRoutes = require('./service');
const requestRoutes = require('./request');
const providerRoutes = require('./provider');
const adminRoutes = require('./admin');
const profileRoutes = require('./profile');  // ADICIONADO
const reviewRoutes = require('./reviews');   // ADICIONADO

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/categories', categoryRoutes);
router.use('/services', serviceRoutes);
router.use('/requests', requestRoutes);
router.use('/providers', providerRoutes);
router.use('/admin', adminRoutes);
router.use('/profile', profileRoutes);       // ADICIONADO
router.use('/reviews', reviewRoutes);        // ADICIONADO

router.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

module.exports = router;