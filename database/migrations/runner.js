const fs = require('fs');
const path = require('path');
const pool = require('../config');

async function runMigrations() {
  const client = await pool.connect();
  try {
    // 1. Stwórz tabelę na zapisane migracje, jeśli nie istnieje
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_name VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 2. Pobierz listę plików migracji (.sql)
    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sortowanie alfabetyczne zapewnia poprawną kolejność (np. 001, 002...)

    console.log(`[MIGRATIONS] Znaleziono ${files.length} plików migracji w ${migrationsDir}`);

    // 3. Pobierz już wykonane migracje z bazy
    const { rows } = await client.query('SELECT migration_name FROM schema_migrations');
    const executedMigrations = new Set(rows.map(r => r.migration_name));

    // 4. Uruchom niewykonane migracje po kolei
    for (const file of files) {
      if (executedMigrations.has(file)) {
        continue; // Pomijamy już wykonane
      }

      console.log(`[MIGRATIONS] Uruchamianie migracji: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Każdy plik migracji uruchamiamy w osobnej transakcji
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (migration_name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[MIGRATIONS] Pomyślnie wykonano migrację: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[MIGRATIONS] [ERROR] Błąd podczas wykonywania migracji ${file}:`, err.message);
        throw err; // Przerywamy dalsze migracje
      }
    }

    console.log('[MIGRATIONS] Wszystkie migracje są aktualne.');
  } catch (err) {
    console.error('[MIGRATIONS] [FATAL] Proces migracji nie powiódł się:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
