const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error(err.stack);

  // Erros de validação do Sequelize
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: 'Erro de validação',
      details: err.errors.map(e => ({
        field: e.path,
        message: e.message
      }))
    });
  }

  // Erros de unicidade
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({
      error: 'Registro duplicado',
      details: err.errors.map(e => ({
        field: e.path,
        message: 'Já existe um registro com este valor'
      }))
    });
  }

  // Erros de chave estrangeira
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      error: 'Referência inválida',
      message: 'O registro referenciado não existe'
    });
  }

  // Erro de upload (multer)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: 'Arquivo muito grande. Tamanho máximo: 10MB'
    });
  }

  if (err.message === 'Apenas imagens são permitidas (jpeg, jpg, png, gif, webp)') {
    return res.status(400).json({
      error: err.message
    });
  }

  // Erro padrão
  res.status(500).json({
    error: process.env.NODE_ENV === 'development' 
      ? err.message 
      : 'Erro interno do servidor'
  });
};

module.exports = { errorHandler };