// backend/src/models/ServiceRequest.js
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ServiceRequest extends Model {
    static associate(models) {
      ServiceRequest.belongsTo(models.User, { as: 'client', foreignKey: 'client_id' });
      ServiceRequest.belongsTo(models.User, { as: 'provider', foreignKey: 'provider_id' });
      ServiceRequest.belongsTo(models.Service, { as: 'service', foreignKey: 'service_id' });
    }
  }

  ServiceRequest.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    request_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    service_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    client_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    provider_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(
        'pending',
        'providers_selected',
        'quoted',
        'accepted',
        'in_progress',
        'completed',
        'cancelled'
      ),
      defaultValue: 'pending',
    },
    scheduled_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    location: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    observations: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    budget: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    final_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    payment_method: {
      type: DataTypes.ENUM('cash', 'card', 'mobile'),
      defaultValue: 'cash',
    },
    payment_status: {
      type: DataTypes.ENUM('pending', 'paid', 'failed'),
      defaultValue: 'pending',
    },
    request_mode: {
      type: DataTypes.ENUM('broadcast', 'category', 'manual'),
      defaultValue: 'manual',
    },
    category_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    requested_provider_count: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    accepted_providers: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    selected_providers: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    quotes: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
    // NOVOS CAMPOS PARA DIVISÃO DE VALOR
    quantity: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    service_price: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    price_per_provider: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    provider_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    is_price_divided: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    accepted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancelled_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'ServiceRequest',
    tableName: 'service_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return ServiceRequest;
};