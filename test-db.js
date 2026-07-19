/**
 * test-db.js
 *
 * Szybki test połączenia z PostgreSQL.
 * Uruchom: node test-db.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = require('./database');

async function test() {
  console.log('Test połączenia z PostgreSQL...\n');

  // Test 1: Sprawdź połączenie
  try {
    const res = await db.query('SELECT NOW() as now, version() as version');
    console.log('✓ Połączenie działa');
    console.log(`  Czas: ${res.rows[0].now}`);
    console.log(`  Wersja PostgreSQL: ${res.rows[0].version.split(' ')[0]}\n`);
  } catch (err) {
    console.error('✗ Błąd połączenia:', err.message);
    process.exit(1);
  }

  // Test 2: Sprawdź tabele
  try {
    const tables = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log(`✓ Znaleziono ${tables.rows.length} tabel:`);
    for (const t of tables.rows) {
      console.log(`  - ${t.table_name}`);
    }
    console.log();
  } catch (err) {
    console.error('✗ Błąd odczytu tabel:', err.message);
  }

  // Test 3: Sprawdź wersję bazy
  try {
    const version = await db.query('SELECT version FROM database_version ORDER BY updated_at DESC LIMIT 1');
    console.log(`✓ Wersja bazy: ${version.rows[0]?.version || 'brak'}\n`);
  } catch (err) {
    console.error('✗ Błąd odczytu wersji:', err.message);
  }

  // Test 4: Liczba użytkowników
  try {
    const count = await db.users.count();
    console.log(`✓ Użytkowników w bazie: ${count}\n`);
  } catch (err) {
    console.error('✗ Błąd odczytu użytkowników:', err.message);
  }

  console.log('Test zakończony!');
  process.exit(0);
}

test();
