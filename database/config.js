/**
 * database/config.js
 *
 * Pool połączeń PostgreSQL.
 * Wymaga: npm install pg dotenv
 *
 * Ustaw DATABASE_URL w .env:
 * DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
 */

require('dotenv').config();
const { Pool } = require('pg');

const pgConn = require('pg/lib/connection-parameters');

// Budujemy konfigurację puli połączeń
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false }
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[DATABASE] Błąd połączenia z bazą danych:', err);
});

pool.on('connect', () => {
  console.log('[DATABASE] Nowe połączenie z bazą danych');
});

module.exports = pool;
