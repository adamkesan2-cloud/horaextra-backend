// backend/src/models/ServiceRequest.js
module.exports = (sequelize, DataTypes) => {
  const ServiceRequest = sequelize.define('ServiceRequest', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    request_number: {
      type: DataTypes.STRING(20),
      unique: true
    },
    service_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    client_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    provider_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'providers_selected', 'quoted', 'accepted', 'in_progress', 'completed', 'cancelled', 'disputed'),
      defaultValue: 'pending'
    },
    scheduled_date: DataTypes.DATE,
    start_time: DataTypes.DATE,
    end_time: DataTypes.DATE,
    location: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        lat: -25.9692,
        lng: 32.5732,
        address: 'Maputo, Moçambique'
      }
    },
    observations: DataTypes.TEXT,
    budget: DataTypes.DECIMAL(10, 2),
    final_price: DataTypes.DECIMAL(10, 2),
    payment_method: DataTypes.ENUM('cash', 'card', 'mpesa', 'bank_transfer'),
    payment_status: {
      type: DataTypes.ENUM('pending', 'paid', 'refunded', 'failed'),
      defaultValue: 'pending'
    },
    selected_providers: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    quotes: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'service_requests',
    timestamps: true,
    underscored: true,
    hooks: {
      beforeCreate: async (request) => {
        if (!request.request_number) {
          const date = new Date();
          const year = date.getFullYear().toString().slice(-2);
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const day = date.getDate().toString().padStart(2, '0');
          const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
          request.request_number = `REQ${year}${month}${day}${random}`;
        }
      }
    }
  });

  return ServiceRequest;
};