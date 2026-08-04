// backend/scripts/add-category-ids-column.js
const { sequelize } = require('../src/config/database');

(async () => {
  try {
    await sequelize.query(
      `ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS category_ids JSONB DEFAULT '[]'`
    );
    console.log('✅ Coluna category_ids adicionada');
  } catch (e) {
    console.error('❌ Erro:', e);
  } finally {
    await sequelize.close();
  }
})();