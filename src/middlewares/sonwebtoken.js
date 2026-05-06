const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * Middleware de autenticação OPCIONAL
 * Se o token estiver presente e válido, adiciona req.user
 * Se não estiver presente ou for inválido, continua sem req.user
 * Útil para rotas que funcionam tanto para usuários logados quanto não logados
 */
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      console.log('ℹ️ optionalAuthMiddleware: sem token, continuando sem autenticação');
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password'] }
      });

      if (user && user.is_active) {
        req.user = user;
        req.userId = user.id;
        console.log('✅ optionalAuthMiddleware: usuário autenticado:', user.email, `(${user.role})`);
      } else {
        console.log('⚠️ optionalAuthMiddleware: usuário não encontrado ou inativo');
      }
    } catch (error) {
      // Token inválido ou expirado, mas não bloqueia
      console.log('⚠️ optionalAuthMiddleware: token inválido/expirado, continuando sem autenticação');
    }

    next();
  } catch (error) {
    console.error('❌ Erro no optionalAuthMiddleware:', error.message);
    // Mesmo com erro, não bloqueia a requisição
    next();
  }
};

module.exports = { optionalAuthMiddleware };