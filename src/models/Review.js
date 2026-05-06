// backend/src/models/Review.js
module.exports = (sequelize, DataTypes) => {
  const Review = sequelize.define(
    'Review',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      reviewer_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        field: 'reviewer_id',
      },
      provider_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        field: 'provider_id',
      },
      request_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'service_requests', key: 'id' },
        field: 'request_id',
      },
      rating: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 5 },
      },
      comment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      tags: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        defaultValue: [],
      },
      is_positive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: 'reviews',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['provider_id'] },
        { fields: ['reviewer_id'] },
        { fields: ['request_id'] },
      ],
    }
  );

  Review.associate = (models) => {
    Review.belongsTo(models.User, { as: 'reviewer', foreignKey: 'reviewer_id' });
    Review.belongsTo(models.User, { as: 'provider', foreignKey: 'provider_id' });
    Review.belongsTo(models.ServiceRequest, { as: 'request', foreignKey: 'request_id' });
  };

  return Review;
};