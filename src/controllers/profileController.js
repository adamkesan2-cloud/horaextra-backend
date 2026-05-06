// backend/src/controllers/profileController.js
const { User, ProviderProfile } = require('../models');

// ==================== CLIENTE ====================

// Buscar perfil do cliente
exports.getClientProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'verification_token', 'reset_password_token'] }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('❌ Erro ao buscar perfil do cliente:', error);
    res.status(500).json({ error: error.message });
  }
};

// Atualizar perfil do cliente
exports.updateClientProfile = async (req, res) => {
  try {
    const { name, phone, address, city, postal_code, photo_url } = req.body;

    await User.update({
      name: name || undefined,
      phone: phone || undefined,
      address: address || undefined,
      city: city || undefined,
      postal_code: postal_code || undefined,
      photo_url: photo_url || undefined,
    }, {
      where: { id: req.user.id }
    });

    const updatedUser = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'verification_token', 'reset_password_token'] }
    });

    res.json({ success: true, message: 'Perfil atualizado com sucesso', data: updatedUser });
  } catch (error) {
    console.error('❌ Erro ao atualizar perfil do cliente:', error);
    res.status(500).json({ error: error.message });
  }
};

// ==================== PRESTADOR ====================

// Buscar perfil do prestador (próprio)
exports.getProviderOwnProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'verification_token', 'reset_password_token'] }
    });

    const profile = await ProviderProfile.findOne({
      where: { user_id: req.user.id }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        photo_url: user.photo_url,
        address: user.address,
        city: user.city,
        postal_code: user.postal_code,
        about: profile?.about || '',
        specialties: profile?.specialties || [],
        experience_years: profile?.experience_years || 0,
        location_name: profile?.location_name || user.city || 'Maputo',
        is_available: profile?.is_available || false,
        completed_jobs: profile?.completed_jobs || 0,
        rating: profile?.rating || 0,
        review_count: profile?.review_count || 0,
        response_rate: profile?.response_rate || 100,
        acceptance_rate: profile?.acceptance_rate || 100,
        created_at: user.created_at,
      }
    });
  } catch (error) {
    console.error('❌ Erro ao buscar perfil do prestador:', error);
    res.status(500).json({ error: error.message });
  }
};

// Atualizar perfil do prestador
exports.updateProviderProfile = async (req, res) => {
  try {
    const { name, phone, address, city, postal_code, photo_url, about, specialties, experience_years, location_name, is_available } = req.body;

    // Atualizar dados do usuário
    await User.update({
      name: name || undefined,
      phone: phone || undefined,
      address: address || undefined,
      city: city || undefined,
      postal_code: postal_code || undefined,
      photo_url: photo_url || undefined,
    }, {
      where: { id: req.user.id }
    });

    // Atualizar perfil do prestador
    await ProviderProfile.update({
      about: about || undefined,
      specialties: specialties || [],
      experience_years: experience_years || undefined,
      location_name: location_name || undefined,
      is_available: is_available !== undefined ? is_available : undefined,
    }, {
      where: { user_id: req.user.id }
    });

    const updatedUser = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'verification_token', 'reset_password_token'] }
    });

    const updatedProfile = await ProviderProfile.findOne({
      where: { user_id: req.user.id }
    });

    res.json({
      success: true,
      message: 'Perfil atualizado com sucesso',
      data: {
        ...updatedUser.toJSON(),
        about: updatedProfile?.about || '',
        specialties: updatedProfile?.specialties || [],
        experience_years: updatedProfile?.experience_years || 0,
        location_name: updatedProfile?.location_name || '',
        is_available: updatedProfile?.is_available || false,
      }
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar perfil do prestador:', error);
    res.status(500).json({ error: error.message });
  }
};

// Buscar perfil público do prestador
exports.getProviderPublicProfile = async (req, res) => {
  try {
    const { provider_id } = req.params;

    const user = await User.findByPk(provider_id, {
      attributes: ['id', 'name', 'photo_url', 'city', 'created_at']
    });

    if (!user) {
      return res.status(404).json({ error: 'Prestador não encontrado' });
    }

    const profile = await ProviderProfile.findOne({
      where: { user_id: provider_id }
    });

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        photo_url: user.photo_url,
        city: user.city,
        member_since: user.created_at,
        about: profile?.about || '',
        specialties: profile?.specialties || [],
        experience_years: profile?.experience_years || 0,
        location_name: profile?.location_name || user.city || 'Maputo',
        completed_jobs: profile?.completed_jobs || 0,
        rating: profile?.rating || 0,
        review_count: profile?.review_count || 0,
        response_rate: profile?.response_rate || 100,
        acceptance_rate: profile?.acceptance_rate || 100,
        is_online: profile?.is_available || false,
      }
    });
  } catch (error) {
    console.error('❌ Erro ao buscar perfil público do prestador:', error);
    res.status(500).json({ error: error.message });
  }
};

// Atualizar disponibilidade
exports.toggleAvailability = async (req, res) => {
  try {
    const { is_available } = req.body;
    
    const profile = await ProviderProfile.findOne({
      where: { user_id: req.user.id }
    });

    if (!profile) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }

    await profile.update({ is_available });

    res.json({
      success: true,
      message: is_available ? 'Disponível para atendimento' : 'Indisponível',
      is_available
    });
  } catch (error) {
    console.error('❌ Erro ao alterar disponibilidade:', error);
    res.status(500).json({ error: error.message });
  }
};