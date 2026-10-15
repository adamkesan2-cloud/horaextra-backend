// backend/src/config/database.js
require('pg');

const { Sequelize } = require('sequelize');

const databaseUrl = process.env.DATABASE_URL;

const config = {
  dialect: 'postgres',
  logging: false,
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
};

let sequelize;

if (databaseUrl) {
  sequelize = new Sequelize(databaseUrl, config);
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      ...config,
      host: process.env.DB_HOST,
      port: Number.parseInt(process.env.DB_PORT, 10) || 6543
    }
  );
}

module.exports = { sequelize };