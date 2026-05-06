require('dotenv').config();
const { Sequelize } = require('sequelize');

const seq = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

const hash = '$2a$10$f8i0GD4aUarhkwZnshjAxuVO2bIyiTAn5bYrFrGTJ94dupb1xAph6';

seq.query(`UPDATE users SET password = '${hash}' WHERE email = 'admin@horaextra.com'`)
  .then(([results, meta]) => {
    console.log('✅ Senha atualizada! Linhas afetadas:', meta.rowCount);
    seq.close();
  })
  .catch(e => {
    console.log('❌ Erro:', e.message);
    seq.close();
  });