const crypto = require('crypto');

// Gerar número aleatório
const generateRandomNumber = (length) => {
  return Math.floor(Math.pow(10, length-1) + Math.random() * 9 * Math.pow(10, length-1));
};

// Gerar código de verificação
const generateVerificationCode = () => {
  return generateRandomNumber(6).toString();
};

// Gerar slug
const generateSlug = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

// Calcular distância entre coordenadas (km)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Formatar preço
const formatPrice = (price) => {
  return new Intl.NumberFormat('pt-MZ', {
    style: 'currency',
    currency: 'MZN'
  }).format(price);
};

// Formatar data
const formatDate = (date, format = 'dd/MM/yyyy') => {
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  
  return format
    .replace('dd', day)
    .replace('MM', month)
    .replace('yyyy', year);
};

// Paginação
const paginate = (page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  return {
    limit: parseInt(limit),
    offset: parseInt(offset)
  };
};

// Filtrar campos
const filterFields = (obj, allowedFields) => {
  const filtered = {};
  allowedFields.forEach(field => {
    if (obj[field] !== undefined) {
      filtered[field] = obj[field];
    }
  });
  return filtered;
};

// Gerar hash
const generateHash = (text) => {
  return crypto.createHash('sha256').update(text).digest('hex');
};

// Mascarar email
const maskEmail = (email) => {
  const [name, domain] = email.split('@');
  const maskedName = name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
  return `${maskedName}@${domain}`;
};

// Mascarar telefone
const maskPhone = (phone) => {
  return phone.replace(/(\d{3})\d{4}(\d{2})/, '$1****$2');
};

module.exports = {
  generateRandomNumber,
  generateVerificationCode,
  generateSlug,
  calculateDistance,
  formatPrice,
  formatDate,
  paginate,
  filterFields,
  generateHash,
  maskEmail,
  maskPhone
};