// backend/src/models/Category.js
module.exports = (sequelize, DataTypes) => {
  const Category = sequelize.define('Category', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    icon: {
      type: DataTypes.STRING(50),
      defaultValue: 'category'
    },
    color: {
      type: DataTypes.STRING(20),
      defaultValue: '#1E3A5F'
    },
    image_url: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    order: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: 'categories',
    timestamps: true,
    underscored: true
  });

  return Category;
};