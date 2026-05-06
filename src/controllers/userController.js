// backend/src/controllers/userController.js
const { User, ProviderProfile } = require('../models');

const userController = {
  getMyProfile: async (req, res) => {
    try {
      console.log(`🔐 Buscando perfil para usuário ID: ${req.user.id}`);
      
      const user = await User.findByPk(req.user.id, {
        attributes: { exclude: ['password', 'verification_token', 'reset_password_token'] },
        include: [{
          model: ProviderProfile,
          as: 'providerProfile',
          required: false
        }]
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      res.json({ success: true, data: user });
    } catch (error) {
      console.error('❌ Erro ao buscar perfil:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  getAllUsers: async (req, res) => {
    try {
      const users = await User.findAll({
        attributes: { exclude: ['password', 'verification_token', 'reset_password_token'] },
        include: [{
          model: ProviderProfile,
          as: 'providerProfile',
          required: false
        }],
        order: [['created_at', 'DESC']]
      });

      res.json({ success: true, data: users });
    } catch (error) {
      console.error('❌ Erro ao buscar usuários:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  getUserById: async (req, res) => {
    try {
      const user = await User.findByPk(req.params.id, {
        attributes: { exclude: ['password', 'verification_token', 'reset_password_token'] },
        include: [{
          model: ProviderProfile,
          as: 'providerProfile',
          required: false
        }]
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      res.json({ success: true, data: user });
    } catch (error) {
      console.error('❌ Erro ao buscar usuário:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  updateUser: async (req, res) => {
    try {
      const user = await User.findByPk(req.params.id);
      
      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      if (req.user.id !== user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const allowedFields = ['name', 'phone', 'photo_url', 'address'];
      const updates = {};
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      });

      await user.update(updates);

      const updatedUser = await User.findByPk(user.id, {
        attributes: { exclude: ['password', 'verification_token', 'reset_password_token'] }
      });

      res.json({ success: true, message: 'Usuário atualizado com sucesso', data: updatedUser });
    } catch (error) {
      console.error('❌ Erro ao atualizar usuário:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  toggleUserStatus: async (req, res) => {
    try {
      const user = await User.findByPk(req.params.id);
      
      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      const newStatus = !user.is_active;
      await user.update({ is_active: newStatus });

      res.json({ 
        success: true, 
        message: `Usuário ${newStatus ? 'ativado' : 'desativado'} com sucesso`,
        is_active: newStatus
      });
    } catch (error) {
      console.error('❌ Erro ao alterar status do usuário:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};

module.exports = userController;