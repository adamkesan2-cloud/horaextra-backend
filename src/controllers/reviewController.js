// backend/src/controllers/reviewController.js
const { Review, User, ProviderProfile, ServiceRequest } = require('../models');
const { Op } = require('sequelize');

// Tags pré-definidas
const POSITIVE_TAGS = [
  'Excelente profissional', 'Muito pontual', 'Preço justo',
  'Educado e profissional', 'Serviço rápido', 'Trabalho de qualidade',
  'Muito competente', 'Recomendo fortemente', 'Trabalho limpo', 'Boa comunicação'
];

const NEGATIVE_TAGS = [
  'Atrasou um pouco', 'Preço acima do esperado', 'Precisou voltar para ajustes',
  'Pouca comunicação', 'Poderia ser mais organizado'
];

// Criar avaliação (apenas cliente)
exports.createReview = async (req, res) => {
  try {
    const { provider_id, request_id, rating, tags } = req.body;
    const reviewer_id = req.user.id;

    // Verificar se é cliente
    if (req.user.role !== 'client') {
      return res.status(403).json({ error: 'Apenas clientes podem avaliar' });
    }

    // Verificar se já avaliou
    const existingReview = await Review.findOne({ 
      where: { request_id, reviewer_id } 
    });
    if (existingReview) {
      return res.status(400).json({ error: 'Você já avaliou este serviço' });
    }

    // Verificar se o serviço foi concluído
    const request = await ServiceRequest.findOne({ 
      where: { id: request_id, client_id: reviewer_id, status: 'completed' }
    });
    if (!request) {
      return res.status(400).json({ error: 'Serviço não concluído ou não encontrado' });
    }

    const isPositive = rating >= 4;
    const validTags = (tags || []).filter(tag => 
      (isPositive ? POSITIVE_TAGS : NEGATIVE_TAGS).includes(tag)
    );

    const review = await Review.create({
      reviewer_id,
      provider_id,
      request_id,
      rating,
      tags: validTags,
      is_positive: isPositive,
    });

    // Buscar review com dados do revisor
    const reviewWithReviewer = await Review.findByPk(review.id, {
      include: [{ model: User, as: 'reviewer', attributes: ['id', 'name', 'photo_url'] }]
    });

    res.status(201).json({ success: true, data: reviewWithReviewer });
  } catch (error) {
    console.error('❌ Erro ao criar avaliação:', error);
    res.status(500).json({ error: error.message });
  }
};

// Buscar avaliações de um prestador
exports.getProviderReviews = async (req, res) => {
  try {
    const { provider_id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: reviews } = await Review.findAndCountAll({
      where: { provider_id },
      include: [{ model: User, as: 'reviewer', attributes: ['id', 'name', 'photo_url'] }],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    res.json({ success: true, data: { reviews, total: count, page: parseInt(page), limit: parseInt(limit) } });
  } catch (error) {
    console.error('❌ Erro ao buscar avaliações:', error);
    res.status(500).json({ error: error.message });
  }
};

// Buscar tags disponíveis
exports.getReviewTags = async (req, res) => {
  res.json({ success: true, data: { positive: POSITIVE_TAGS, negative: NEGATIVE_TAGS } });
};

// Estatísticas do prestador
exports.getProviderStats = async (req, res) => {
  try {
    const { provider_id } = req.params;

    const profile = await ProviderProfile.findOne({
      where: { user_id: provider_id }
    });

    const pendingRequests = await ServiceRequest.count({
      where: { provider_id, status: { [Op.in]: ['pending', 'providers_selected'] } }
    });

    const activeServices = await ServiceRequest.count({
      where: { provider_id, status: { [Op.in]: ['accepted', 'in_progress'] } }
    });

    const totalEarnings = await ServiceRequest.sum('budget', {
      where: { provider_id, status: 'completed' }
    });

    res.json({
      success: true,
      data: {
        completedJobs: profile?.completed_jobs || 0,
        rating: profile?.rating || 0,
        reviewCount: profile?.review_count || 0,
        responseRate: profile?.response_rate || 100,
        acceptanceRate: profile?.acceptance_rate || 100,
        pendingRequests,
        activeServices,
        totalEarnings: totalEarnings || 0,
      }
    });
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas:', error);
    res.status(500).json({ error: error.message });
  }
};

// Verificar se cliente pode avaliar
exports.canReview = async (req, res) => {
  try {
    const { provider_id } = req.params;
    const reviewer_id = req.user.id;

    const completedService = await ServiceRequest.findOne({
      where: {
        client_id: reviewer_id,
        provider_id,
        status: 'completed'
      }
    });

    if (!completedService) {
      return res.json({ success: true, canReview: false, message: 'Nenhum serviço concluído com este prestador' });
    }

    const existingReview = await Review.findOne({
      where: { reviewer_id, provider_id, request_id: completedService.id }
    });

    res.json({
      success: true,
      canReview: !existingReview,
      requestId: completedService.id,
      message: existingReview ? 'Você já avaliou este serviço' : 'Você pode avaliar este prestador'
    });
  } catch (error) {
    console.error('❌ Erro ao verificar permissão de avaliação:', error);
    res.status(500).json({ error: error.message });
  }
};