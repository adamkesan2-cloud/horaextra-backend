// backend/src/models/User.js
const bcrypt = require('bcryptjs');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
      },
      password: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM('admin', 'client', 'provider'),
        defaultValue: 'client',
      },
      photo_url: {
  type: DataTypes.TEXT,
  allowNull: true,
},
      // Dados de endereço
      address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      city: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      postal_code: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      // Localização GPS
      latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: true,
        defaultValue: -25.9692,
      },
      longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true,
        defaultValue: 32.5732,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      is_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      verification_token: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      reset_password_token: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      reset_password_expires: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      last_login_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      last_login_ip: {
        type: DataTypes.STRING(45),
        allowNull: true,
      },
      location: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: null,
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },
    },
    {
      tableName: 'users',
      timestamps: true,
      underscored: true,
      hooks: {
        beforeCreate: async (user) => {
          if (user.password) {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(user.password, salt);
          }
        },
        beforeUpdate: async (user) => {
          if (user.changed('password')) {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(user.password, salt);
          }
        },
      },
    }
  );

  User.prototype.validatePassword = async function (password) {
    return bcrypt.compare(password, this.password);
  };

  User.prototype.toJSON = function () {
    const values = Object.assign({}, this.get());
    delete values.password;
    delete values.verification_token;
    delete values.reset_password_token;
    return values;
  };

  User.associate = (models) => {
    User.hasOne(models.ProviderProfile, { foreignKey: 'user_id', as: 'providerProfile' });
    User.hasMany(models.ServiceRequest, { foreignKey: 'client_id', as: 'clientRequests' });
    User.hasMany(models.ServiceRequest, { foreignKey: 'provider_id', as: 'providerServices' });
    User.hasMany(models.Review, { foreignKey: 'client_id', as: 'clientReviews' });
    User.hasMany(models.Review, { foreignKey: 'provider_id', as: 'providerReviews' });
    User.hasMany(models.Notification, { foreignKey: 'user_id', as: 'notifications' });
  };

  return User;
};