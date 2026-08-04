'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('provider_profiles', 'category_ids', {
      type: Sequelize.JSONB,
      defaultValue: [],
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('provider_profiles', 'category_ids');
  },
};