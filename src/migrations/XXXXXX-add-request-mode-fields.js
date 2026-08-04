'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('service_requests', 'request_mode', {
      type: Sequelize.ENUM('broadcast', 'category', 'manual'),
      defaultValue: 'manual',
    });
    await queryInterface.addColumn('service_requests', 'category_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addColumn('service_requests', 'requested_provider_count', {
      type: Sequelize.INTEGER,
      defaultValue: 1,
    });
    await queryInterface.addColumn('service_requests', 'accepted_providers', {
      type: Sequelize.JSONB,
      defaultValue: [],
    });
    await queryInterface.addColumn('service_requests', 'split_budget', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('service_requests', 'request_mode');
    await queryInterface.removeColumn('service_requests', 'category_id');
    await queryInterface.removeColumn('service_requests', 'requested_provider_count');
    await queryInterface.removeColumn('service_requests', 'accepted_providers');
    await queryInterface.removeColumn('service_requests', 'split_budget');
  },
};