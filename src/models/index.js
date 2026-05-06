// backend/src/models/index.js
const { Sequelize } = require('sequelize');
const { sequelize } = require('../config/database');

// Importar modelos
const User = require('./User')(sequelize, Sequelize);
const Category = require('./Category')(sequelize, Sequelize);
const Service = require('./Service')(sequelize, Sequelize);
const ProviderProfile = require('./ProviderProfile')(sequelize, Sequelize);
const ServiceRequest = require('./ServiceRequest')(sequelize, Sequelize);
const Review = require('./Review')(sequelize, Sequelize);
const Notification = require('./Notification')(sequelize, Sequelize);

// Associações
// Category <-> Service
Category.hasMany(Service, { foreignKey: 'category_id', as: 'services' });
Service.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });

// User <-> ProviderProfile
User.hasOne(ProviderProfile, { foreignKey: 'user_id', as: 'providerProfile' });
ProviderProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> ServiceRequest
User.hasMany(ServiceRequest, { foreignKey: 'client_id', as: 'clientRequests' });
User.hasMany(ServiceRequest, { foreignKey: 'provider_id', as: 'providerRequests' });
ServiceRequest.belongsTo(User, { foreignKey: 'client_id', as: 'client' });
ServiceRequest.belongsTo(User, { foreignKey: 'provider_id', as: 'provider' });

// Service <-> ServiceRequest
Service.hasMany(ServiceRequest, { foreignKey: 'service_id', as: 'requests' });
ServiceRequest.belongsTo(Service, { foreignKey: 'service_id', as: 'service' });

// User <-> Review (CORRIGIDO)
User.hasMany(Review, { foreignKey: 'reviewer_id', as: 'reviewsGiven' });
User.hasMany(Review, { foreignKey: 'provider_id', as: 'reviewsReceived' });
Review.belongsTo(User, { foreignKey: 'reviewer_id', as: 'reviewer' });
Review.belongsTo(User, { foreignKey: 'provider_id', as: 'provider' });

// ServiceRequest <-> Review
ServiceRequest.hasOne(Review, { foreignKey: 'request_id', as: 'review' });
Review.belongsTo(ServiceRequest, { foreignKey: 'request_id', as: 'request' });

// User <-> Notification
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = {
  User,
  Category,
  Service,
  ProviderProfile,
  ServiceRequest,
  Review,
  Notification,
  sequelize
};