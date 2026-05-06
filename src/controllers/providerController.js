// backend/src/controllers/providerController.js
const { ProviderProfile, User, ServiceRequest } = require('../models');
const { Op } = require('sequelize');

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ── CORRIGIDO: remove filtro is_available para mostrar TODOS os aprovados ──────
// Antes: { is_available: true, is_approved: true }  ← bloqueava o adams
// Agora: { is_approved: true }                       ← mostra online e offline
exports.findNearbyProviders = async (req, res) => {
  try {
    const { lat, lng, maxDistance = 20 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'Coordenadas não fornecidas' });

    const clientLat = parseFloat(lat);
    const clientLng = parseFloat(lng);

    const providers = await ProviderProfile.findAll({
      where: { is_approved: true }, // ← sem filtro is_available
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'photo_url', 'email', 'phone']
      }]
    });

    const providersWithDistance = providers.map(provider => {
      const user = provider.user || {};

      // Localização: usar a do perfil ou fallback próximo a Maputo com
      // pequena variação aleatória para os prestadores sem GPS definido
      let provLat, provLng;
      const loc = provider.location;
      if (loc && typeof loc === 'object' && (loc.lat || loc.latitude)) {
        provLat = parseFloat(loc.lat ?? loc.latitude);
        provLng = parseFloat(loc.lng ?? loc.longitude);
      } else {
        // Fallback: posição aleatória num raio de ~1 km de Maputo centro
        provLat = -25.9692 + (Math.random() - 0.5) * 0.018;
        provLng =  32.5732 + (Math.random() - 0.5) * 0.018;
      }

      const distance = calculateDistance(clientLat, clientLng, provLat, provLng);

      return {
        id: provider.user_id,       // ← UUID do utilizador (match com WS)
        user_id: provider.user_id,
        name: user.name || 'Prestador',
        photoUrl: user.photo_url || '',
        rating: Number(provider.rating) || 4.5,
        reviewCount: provider.review_count || 0,
        distance: Number(distance.toFixed(1)),
        price: 1500 + (provider.experience_years || 0) * 30,
        specialties: provider.specialties || [],
        completedJobs: provider.completed_jobs || 0,
        matchScore: (Number(provider.rating) || 4.5) * 10,
        isOnline: provider.is_available,   // true/false — mapa mostra verde/cinza
        latitude: provLat,
        longitude: provLng,
        // Campo "user" aninhado para compatibilidade com ProviderModel.fromJson
        user: {
          id: user.id || provider.user_id,
          name: user.name || 'Prestador',
          photo_url: user.photo_url || null,
          email: user.email || '',
          phone: user.phone || '',
        },
      };
    });

    const filtered = providersWithDistance
      .filter(p => p.distance <= parseFloat(maxDistance))
      .sort((a, b) => b.matchScore - a.matchScore);

    console.log(`📍 findNearbyProviders: ${filtered.length} prestador(es) em ${maxDistance}km`);
    filtered.forEach(p =>
      console.log(`   → ${p.name} (${p.id}) | dist=${p.distance}km | online=${p.isOnline}`)
    );

    res.json(filtered);
  } catch (error) {
    console.error('❌ Erro ao buscar prestadores:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

exports.getProviderById = async (req, res) => {
  try {
    const provider = await ProviderProfile.findOne({
      where: { user_id: req.params.id },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'photo_url', 'email', 'phone'] }]
    });
    if (!provider) return res.status(404).json({ error: 'Prestador não encontrado' });
    res.json({ success: true, data: provider });
  } catch (error) {
    console.error('❌ Erro ao buscar prestador:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

exports.getMyStats = async (req, res) => {
  try {
    const profile = await ProviderProfile.findOne({ where: { user_id: req.user.id } });
    const pendingRequests = await ServiceRequest.count({
      where: { provider_id: req.user.id, status: 'pending' }
    });
    const completedJobs = await ServiceRequest.count({
      where: { provider_id: req.user.id, status: 'completed' }
    });

    res.json({
      completedJobs: profile?.completed_jobs || 0,
      rating: Number(profile?.rating) || 0,
      reviewCount: profile?.review_count || 0,
      responseRate: profile?.response_rate || 100,
      acceptanceRate: profile?.acceptance_rate || 100,
      pendingRequests,
      activeServices: 0,
      completedJobsCount: completedJobs,
      totalEarnings: completedJobs * 1500
    });
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas:', error);
    res.json({
      completedJobs: 0, rating: 0, reviewCount: 0, responseRate: 100,
      acceptanceRate: 100, pendingRequests: 0, activeServices: 0,
      completedJobsCount: 0, totalEarnings: 0
    });
  }
};

exports.getMyServices = async (req, res) => {
  try {
    const services = await ServiceRequest.findAll({
      where: { provider_id: req.user.id },
      include: [
        { model: User, as: 'client', attributes: ['id', 'name', 'phone'] },
        { model: require('../models').Service, as: 'service', attributes: ['id', 'name', 'price'] }
      ],
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, data: services });
  } catch (error) {
    console.error('❌ Erro ao buscar serviços:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

exports.updateProviderProfile = async (req, res) => {
  try {
    const profile = await ProviderProfile.findOne({ where: { user_id: req.user.id } });
    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });

    const allowedFields = [
      'description', 'specialties', 'experience_years',
      'working_hours', 'service_radius', 'location', 'is_available'
    ];
    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    await profile.update(updates);
    res.json({ success: true, message: 'Perfil atualizado com sucesso', data: profile });
  } catch (error) {
    console.error('❌ Erro ao atualizar perfil:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

exports.toggleAvailability = async (req, res) => {
  try {
    const profile = await ProviderProfile.findOne({ where: { user_id: req.user.id } });
    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });

    const { is_available } = req.body;
    await profile.update({ is_available });
    res.json({
      success: true,
      message: `Disponibilidade alterada para ${is_available ? 'disponível' : 'indisponível'}`,
      is_available
    });
  } catch (error) {
    console.error('❌ Erro ao alterar disponibilidade:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

exports.getProviderReviews  = async (req, res) => res.json({ success: true, data: [] });
exports.getProviderStats    = async (req, res) => res.json({ success: true, data: {} });
exports.getProvidersBySpecialty = async (req, res) => res.json({ success: true, data: [] });
exports.getTopRatedProviders    = async (req, res) => res.json({ success: true, data: [] });