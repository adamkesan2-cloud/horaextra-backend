const { Client } = require('pg');
const dns = require('dns');
require('dotenv').config();

// Forçar IPv4
dns.setDefaultResultOrder('ipv4first');

console.log('🔍 Testando conexão com Supabase...');
console.log(`Host: ${process.env.DB_HOST}`);
console.log(`User: ${process.env.DB_USER}`);
console.log(`Database: ${process.env.DB_NAME}`);

const client = new Client({
  host: process.env.DB_HOST,
  port: 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    await client.connect();
    console.log('✅ CONEXÃO BEM-SUCEDIDA!');
    
    const res = await client.query('SELECT NOW()');
    console.log('📊 Hora do servidor:', res.rows[0].now);
    
    await client.end();
  } catch (error) {
    console.error('❌ ERRO:', error.message);
    console.log('\n🔧 Possíveis soluções:');
    console.log('1. Verifique se o Supabase está ativo: https://app.supabase.com/project/enebxldzesysuqkffknb');
    console.log('2. Aguarde 1-2 minutos após reativar o projeto');
    console.log('3. Execute: ipconfig /flushdns');
  }
  process.exit();
}

test();