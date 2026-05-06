// backend/src/models/Service.js
module.exports = (sequelize, DataTypes) => {
  const Service = sequelize.define('Service', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    category_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'categories',
        key: 'id'
      }
    },
    estimated_time: {
      type: DataTypes.INTEGER,
      defaultValue: 60
    },
    is_available: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    images: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    requirements: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    rating: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0
    },
    review_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: 'services',
    timestamps: true,
    underscored: true
  });

  return Service;
};