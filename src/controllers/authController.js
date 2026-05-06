// backend/src/controllers/authController.js
const jwt = require('jsonwebtoken');
const { User, ProviderProfile } = require('../models');
const { Op } = require('sequelize');

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// ── HELPERS ───────────────────────────────────────────────────────────────────

function _parseLocation(location) {
  if (!location || location === 'null' || location === 'undefined') return null;
  try {
    return typeof location === 'string' ? JSON.parse(location) : location;
  } catch (e) {
    console.warn('⚠️ Erro ao parsear location:', location);
    return null;
  }
}

function _parseSpecialties(specialties) {
  if (!specialties || specialties === 'null' || specialties === 'undefined') return [];
  try {
    return typeof specialties === 'string' ? JSON.parse(specialties) : specialties;
  } catch (e) {
    console.warn('⚠️ Erro ao parsear specialties:', specialties);
    return [];
  }
}

function _formatUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    photo_url: user.photo_url,
    is_verified: user.is_verified,
    is_active: user.is_active,
    created_at: user.created_at,
  };
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────

exports.login = async (req, res) => {
  try {
    console.log('🔍 Tentativa de login:', req.body.email);
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const user = await User.findOne({
      where: { email },
      include: [{ model: ProviderProfile, as: 'providerProfile', required: false }],
    });

    if (!user) return res.status(401).json({ error: 'Email ou senha inválidos' });

    const isValidPassword = await user.validatePassword(password);
    if (!isValidPassword) return res.status(401).json({ error: 'Email ou senha inválidos' });

    if (!user.is_active) return res.status(403).json({ error: 'Usuário desativado' });

    if (user.role === 'provider' && user.providerProfile && !user.providerProfile.is_approved) {
      return res.status(403).json({ error: 'Aguardando aprovação do administrador' });
    }

    await user.update({ last_login_at: new Date(), last_login_ip: req.ip });
    const token = generateToken(user);
    console.log('✅ Login bem-sucedido:', user.email, `(${user.role})`);

    res.json({ success: true, message: 'Login realizado com sucesso', user: _formatUser(user), token });
  } catch (error) {
    console.error('❌ Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ── REGISTER CLIENTE ──────────────────────────────────────────────────────────

exports.register = async (req, res) => {
  try {
    const { name, email, phone, password, role, location } = req.body;
    console.log('📝 Register cliente:', { name, email, phone, role });

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    const existingUser = await User.findOne({
      where: { [Op.or]: [{ email }, { phone }] },
    });
    if (existingUser) return res.status(400).json({ error: 'Email ou telefone já cadastrado' });

    const user = await User.create({
      name, email, phone, password,
      role: role || 'client',
      is_active: true,
      is_verified: true,
      location: _parseLocation(location),
    });

    const token = generateToken(user);
    console.log('✅ Cliente cadastrado:', email);
    res.status(201).json({ success: true, message: 'Usuário cadastrado com sucesso', user: _formatUser(user), token });
  } catch (error) {
    console.error('❌ Erro no registro de cliente:', error);
    res.status(500).json({ error: error.message });
  }
};

// ── REGISTER PRESTADOR ────────────────────────────────────────────────────────

exports.registerProvider = async (req, res) => {
  try {
    console.log('📝 Registro de prestador iniciado');
    console.log('   Body fields:', Object.keys(req.body));
    console.log('   Files recebidos:', req.files ? Object.keys(req.files) : 'nenhum');

    const { name, email, phone, password, location, description, specialties, experience_years } = req.body;

    // Validação dos campos obrigatórios
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    // Documento de identificação é obrigatório
    if (!req.files?.id_document || req.files.id_document.length === 0) {
      return res.status(400).json({ error: 'Documento de identificação é obrigatório' });
    }

    // Validação do nome do CV (se enviado)
    if (req.files?.cv && req.files.cv.length > 0) {
      const cvName = req.files.cv[0].originalname;
      const nameWithoutExt = cvName.split('.').shift();
      if (/\d/.test(nameWithoutExt)) {
        return res.status(400).json({ error: 'O nome do arquivo do currículo não deve conter números' });
      }
    }

    // Verifica duplicatas
    const existingUser = await User.findOne({
      where: { [Op.or]: [{ email }, { phone }] },
    });
    if (existingUser) return res.status(400).json({ error: 'Email ou telefone já cadastrado' });

    const parsedLocation = _parseLocation(location);
    const parsedSpecialties = _parseSpecialties(specialties);

    // Cria utilizador (inactivo até aprovação)
    const user = await User.create({
      name, email, phone, password,
      role: 'provider',
      is_active: false,
      is_verified: true,
      location: parsedLocation,
    });

    // Guarda referência ao ficheiro — com memoryStorage usa originalname
    const idDocUrl = req.files.id_document[0].originalname || `doc_${user.id}`;
    const cvUrl = req.files?.cv?.length > 0 ? (req.files.cv[0].originalname || `cv_${user.id}`) : null;

    // Cria perfil de prestador
    await ProviderProfile.create({
      user_id: user.id,
      description: description || '',
      specialties: parsedSpecialties,
      experience_years: parseInt(experience_years) || 0,
      is_approved: false,
      is_available: false,
      cv_url: cvUrl,
      id_document_url: idDocUrl,
      location: parsedLocation,
    });

    console.log('✅ Prestador cadastrado (aguardando aprovação):', email);
    res.status(201).json({
      success: true,
      message: 'Cadastro enviado para análise. Aguarde aprovação do administrador.',
    });
  } catch (error) {
    console.error('❌ Erro no registro de prestador:', error);
    res.status(500).json({ error: error.message });
  }
};

// ── LOGOUT ────────────────────────────────────────────────────────────────────

exports.logout = async (req, res) => {
  res.json({ success: true, message: 'Logout realizado com sucesso' });
};

// ── VERIFY EMAIL ──────────────────────────────────────────────────────────────

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({ where: { verification_token: token } });
    if (!user) return res.status(400).json({ error: 'Token inválido' });

    await user.update({ is_verified: true, email_verified_at: new Date(), verification_token: null });
    res.json({ success: true, message: 'Email verificado com sucesso' });
  } catch (error) {
    console.error('❌ Erro ao verificar email:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ── FORGOT PASSWORD ───────────────────────────────────────────────────────────

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const resetToken = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET + user.password,
      { expiresIn: '1h' }
    );

    await user.update({
      reset_password_token: resetToken,
      reset_password_expires: new Date(Date.now() + 3_600_000),
    });

    console.log('📧 Token de reset gerado para:', email);
    res.json({ success: true, message: 'Email de recuperação enviado' });
  } catch (error) {
    console.error('❌ Erro no forgot password:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ── RESET PASSWORD ────────────────────────────────────────────────────────────

exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      where: {
        reset_password_token: token,
        reset_password_expires: { [Op.gt]: new Date() },
      },
    });
    if (!user) return res.status(400).json({ error: 'Token inválido ou expirado' });

    await user.update({ password, reset_password_token: null, reset_password_expires: null });
    res.json({ success: true, message: 'Senha redefinida com sucesso' });
  } catch (error) {
    console.error('❌ Erro no reset password:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ── REFRESH TOKEN ─────────────────────────────────────────────────────────────

exports.refreshToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token não fornecido' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user || !user.is_active) return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });

    res.json({ success: true, token: generateToken(user) });
  } catch (error) {
    console.error('❌ Erro no refresh token:', error);
    res.status(401).json({ error: 'Token inválido' });
  }
};