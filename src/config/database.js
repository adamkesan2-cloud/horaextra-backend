// backend/src/config/database.js
const pg = require('pg');
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME || 'postgres',
  process.env.DB_USER || 'postgres.enebxldzesysuqkffknb',
  process.env.DB_PASSWORD || 'YsqPKf0YHZzRNNJR',
  {
    host: process.env.DB_HOST || 'aws-1-us-west-1.pooler.supabase.com',
    port: parseInt(process.env.DB_PORT) || 5432,
    dialect: 'postgres',
    logging: console.log,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  }
);

module.exports = { sequelize };