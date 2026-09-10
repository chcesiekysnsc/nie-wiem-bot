/**
 * Resilient Database Adapter (PostgreSQL + Zero-Setup Local Fallback)
 * Jesli PostgreSQL dziala -> uzywa puli PostgreSQL.
 * Jesli PostgreSQL nie jest uruchomiony -> bezblednie przelacza sie na wbudowany magazyn lokalny data/multi_accounts.json.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOCAL_DB_PATH = path.join(DATA_DIR, 'multi_accounts.json');

let usePostgres = false;
let pool = null;

function getLocalStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify({ accounts: [], users: {}, inventory: {} }), 'utf8');
  }
  try {
    return JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8'));
  } catch (_) {
    return { accounts: [], users: {}, inventory: {} };
  }
}

function saveLocalStore(data) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data), 'utf8');
  } catch (err) {
    console.error('[LOCAL-DB] Blad zapisu bazy lokalnej:', err);
  }
}

async function initDatabase() {
  // Sprobuj polaczyc z PostgreSQL jesli skonfigurowany
  try {
    const testPool = new Pool({
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'wojtek_bot_db',
      max: 10,
      connectionTimeoutMillis: 2000,
    });

    const client = await testPool.connect();
    await client.query('SELECT 1');
    await client.query(`
      CREATE TABLE IF NOT EXISTS bot_accounts (
        id SERIAL PRIMARY KEY,
        fb_user_id VARCHAR(64) UNIQUE,
        email VARCHAR(255) NOT NULL,
        encrypted_password TEXT,
        totp_secret VARCHAR(64),
        appstate JSONB,
        proxy_url VARCHAR(255),
        status VARCHAR(32) DEFAULT 'active',
        last_login_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS economy_users (
        user_id VARCHAR(64) PRIMARY KEY,
        balance BIGINT DEFAULT 1000,
        bank BIGINT DEFAULT 0,
        data JSONB DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS economy_inventory (
        user_id VARCHAR(64) PRIMARY KEY,
        items JSONB DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_accounts_status ON bot_accounts(status);
    `);
    client.release();
    pool = testPool;
    usePostgres = true;
    console.log('[DB] ✅ Polaczono z baza PostgreSQL. Tryb produkcyjny aktywny.');
    return;
  } catch (err) {
    usePostgres = false;
    console.log('[DB] ℹ️ PostgreSQL nie jest dostepny na localhost:5432.');
    console.log('[DB] 🚀 Uzywam wbudowanego magazynu bazy: data/multi_accounts.json (Tryb Zero-Setup).');
    getLocalStore(); // upewnij sie ze plik istnieje
  }
}

async function getActiveAccounts() {
  if (usePostgres && pool) {
    const res = await pool.query(
      "SELECT id, fb_user_id, email, appstate, proxy_url, status FROM bot_accounts WHERE status = 'active' ORDER BY id ASC"
    );
    return res.rows;
  }
  const store = getLocalStore();
  return (store.accounts || []).filter(a => a.status === 'active');
}

async function addAccount(accountData) {
  if (usePostgres && pool) {
    const res = await pool.query(
      `INSERT INTO bot_accounts (email, totp_secret, appstate, proxy_url, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id, email, status`,
      [accountData.email, accountData.totp_secret || null, JSON.stringify(accountData.appstate), accountData.proxy_url || null]
    );
    const row = res.rows[0];
    row.appstate = accountData.appstate;
    row.proxy_url = accountData.proxy_url;
    return row;
  }

  const store = getLocalStore();
  const nextId = (store.accounts && store.accounts.length > 0)
    ? Math.max(...store.accounts.map(a => a.id || 0)) + 1
    : 1;

  const newAcc = {
    id: nextId,
    email: accountData.email,
    totp_secret: accountData.totp_secret || null,
    appstate: accountData.appstate,
    proxy_url: accountData.proxy_url || null,
    status: 'active',
    created_at: new Date().toISOString()
  };

  store.accounts = store.accounts || [];
  store.accounts.push(newAcc);
  saveLocalStore(store);
  return newAcc;
}

async function updateAccountAppstate(accountId, appstate) {
  if (usePostgres && pool) {
    await pool.query(
      'UPDATE bot_accounts SET appstate = $1, last_login_at = NOW() WHERE id = $2',
      [JSON.stringify(appstate), accountId]
    );
    return;
  }

  const store = getLocalStore();
  const acc = (store.accounts || []).find(a => String(a.id) === String(accountId));
  if (acc) {
    acc.appstate = appstate;
    acc.last_login_at = new Date().toISOString();
    saveLocalStore(store);
  }
}

async function updateAccountStatus(accountId, status) {
  if (usePostgres && pool) {
    await pool.query('UPDATE bot_accounts SET status = $1 WHERE id = $2', [status, accountId]);
    return;
  }

  const store = getLocalStore();
  const acc = (store.accounts || []).find(a => String(a.id) === String(accountId));
  if (acc) {
    acc.status = status;
    saveLocalStore(store);
  }
}

async function getUser(userId) {
  if (usePostgres && pool) {
    const res = await pool.query('SELECT * FROM economy_users WHERE user_id = $1', [userId]);
    return res.rows[0] || null;
  }
  const store = getLocalStore();
  return store.users?.[userId] || null;
}

async function adjustUserBalance(userId, amount) {
  if (usePostgres && pool) {
    const res = await pool.query(
      `INSERT INTO economy_users (user_id, balance) 
       VALUES ($1, $2 + 1000)
       ON CONFLICT (user_id) 
       DO UPDATE SET balance = economy_users.balance + $2, updated_at = NOW()
       RETURNING balance`,
      [userId, amount]
    );
    return res.rows[0].balance;
  }

  const store = getLocalStore();
  store.users = store.users || {};
  if (!store.users[userId]) {
    store.users[userId] = { user_id: userId, balance: 1000 + amount, bank: 0 };
  } else {
    store.users[userId].balance = (store.users[userId].balance || 0) + amount;
  }
  saveLocalStore(store);
  return store.users[userId].balance;
}

module.exports = {
  initDatabase,
  getActiveAccounts,
  addAccount,
  updateAccountAppstate,
  updateAccountStatus,
  getUser,
  adjustUserBalance
};
