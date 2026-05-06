// backend/src/controllers/adminController.js
const { User, ProviderProfile, ServiceRequest, Category, Service } = require('../models');
const { Op } = require('sequelize');
const { sendProviderApprovedEmail, sendProviderRejectedEmail } = require('../utils/emailService');

exports.getStats = async (req, res) => {
  try {
    const totalUsers = await User.count();
    const totalProviders = await User.count({ where: { role: 'provider' } });
    const totalClients = await User.count({ where: { role: 'client' } });
    const pendingProviders = await ProviderProfile.count({ where: { is_approved: false } });
    const totalCategories = await Category.count();
    const totalServices = await Service.count();
    const totalRequests = await ServiceRequest.count();

    res.json({
      success: true,
      data: { totalUsers, totalProviders, totalClients, pendingProviders, totalCategories, totalServices, totalRequests }
    });
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password'] },
      include: [{ model: ProviderProfile, as: 'providerProfile', required: false }],
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('❌ Erro ao buscar usuários:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

exports.getPendingProviders = async (req, res) => {
  try {
    const providers = await ProviderProfile.findAll({
      where: { is_approved: false },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone', 'created_at'] }],
      order: [['created_at', 'ASC']]
    });
    res.json({ success: true, data: providers });
  } catch (error) {
    console.error('❌ Erro ao buscar prestadores pendentes:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

exports.approveProvider = async (req, res) => {
  try {
    const profile = await ProviderProfile.findOne({ where: { user_id: req.params.id } });
    if (!profile) return res.status(404).json({ error: 'Prestador não encontrado' });

    await profile.update({ is_approved: true, approved_by: req.user.id, approved_at: new Date() });
    await User.update({ is_active: true }, { where: { id: req.params.id } });

    const user = await User.findByPk(req.params.id);
    if (user) await sendProviderApprovedEmail(user);

    console.log('✅ Prestador aprovado:', req.params.id);
    res.json({ success: true, message: 'Prestador aprovado com sucesso' });
  } catch (error) {
    console.error('❌ Erro ao aprovar prestador:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

exports.rejectProvider = async (req, res) => {
  try {
    const profile = await ProviderProfile.findOne({ where: { user_id: req.params.id } });
    if (!profile) return res.status(404).json({ error: 'Prestador não encontrado' });

    const user = await User.findByPk(req.params.id);
    if (user) await sendProviderRejectedEmail(user);

    await profile.destroy();
    await User.destroy({ where: { id: req.params.id } });

    console.log('✅ Prestador rejeitado:', req.params.id);
    res.json({ success: true, message: 'Prestador rejeitado' });
  } catch (error) {
    console.error('❌ Erro ao rejeitar prestador:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

exports.getReports = async (req, res) => {
  try {
    const { startDate, endDate, type } = req.query;
    const where = {};
    if (startDate && endDate) {
      where.created_at = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    }

    let data = [];
    let summary = {};

    if (type === 'users' || !type) {
      data = await User.findAll({ where, attributes: { exclude: ['password'] } });
      summary = {
        total: data.length,
        providers: data.filter(u => u.role === 'provider').length,
        clients: data.filter(u => u.role === 'client').length
      };
    } else if (type === 'requests') {
      data = await ServiceRequest.findAll({
        where,
        include: [
          { model: User, as: 'client' },
          { model: Service, as: 'service' }
        ]
      });
      summary = { total: data.length };
    }

    res.json({ success: true, data, summary });
  } catch (error) {
    console.error('❌ Erro ao gerar relatório:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};