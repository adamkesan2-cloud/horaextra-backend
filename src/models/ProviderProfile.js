// backend/src/models/ProviderProfile.js
module.exports = (sequelize, DataTypes) => {
  const ProviderProfile = sequelize.define('ProviderProfile', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    specialties: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    experience_years: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    completed_jobs: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    rating: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0
    },
    review_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    response_rate: {
      type: DataTypes.INTEGER,
      defaultValue: 100
    },
    response_time: {
      type: DataTypes.INTEGER,
      defaultValue: 30
    },
    acceptance_rate: {
      type: DataTypes.INTEGER,
      defaultValue: 100
    },
    is_available: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    working_hours: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    service_radius: {
      type: DataTypes.INTEGER,
      defaultValue: 20
    },
    location: {
      type: DataTypes.JSON,
      defaultValue: {
        lat: -25.9692,
        lng: 32.5732,
        address: '',
        city: 'Maputo',
        neighborhood: '',
        country: 'Moçambique'
      }
    },
    documents: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    cv_url: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    id_document_url: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    is_approved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    approved_by: {
      type: DataTypes.UUID,
      allowNull: true
    },
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'provider_profiles',
    timestamps: true,
    underscored: true
  });

  return ProviderProfile;
};