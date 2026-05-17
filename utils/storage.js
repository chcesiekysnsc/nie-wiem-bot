const fs = require('fs');
const path = require('path');

const config = require('../config/config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  inventory: path.join(DATA_DIR, 'inventory.json'),
  cooldowns: path.join(DATA_DIR, 'cooldowns.json'),
  logs: path.join(DATA_DIR, 'logs.json')
};

const FILE_DEFAULTS = {
  users: {},
  inventory: {},
  cooldowns: {
    commands: {},
    spam: {}
  },
  logs: []
};

let writeQueue = Promise.resolve();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.floor(parsed);
}

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  for (const [key, filePath] of Object.entries(DATA_FILES)) {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(FILE_DEFAULTS[key], null, 2));
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) {
      fs.writeFileSync(filePath, JSON.stringify(FILE_DEFAULTS[key], null, 2));
    }
  }
}

function normalizeCooldowns(data) {
  const normalized = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  normalized.commands = normalized.commands && typeof normalized.commands === 'object' && !Array.isArray(normalized.commands)
    ? normalized.commands
    : {};
  normalized.spam = normalized.spam && typeof normalized.spam === 'object' && !Array.isArray(normalized.spam)
    ? normalized.spam
    : {};
  return normalized;
}

function normalizeData(key, data) {
  if (key === 'logs') {
    return Array.isArray(data) ? data : [];
  }

  if (key === 'cooldowns') {
    return normalizeCooldowns(data);
  }

  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function loadData(key) {
  ensureDataFiles();
  const filePath = DATA_FILES[key];

  if (!filePath) {
    throw new Error(`Unknown data key: ${key}`);
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = raw.trim() ? JSON.parse(raw) : clone(FILE_DEFAULTS[key]);
    return normalizeData(key, parsed);
  } catch (error) {
    const fallback = clone(FILE_DEFAULTS[key]);
    saveData(key, fallback);
    return fallback;
  }
}

function saveData(key, data) {
  ensureDataFiles();
  const filePath = DATA_FILES[key];

  if (!filePath) {
    throw new Error(`Unknown data key: ${key}`);
  }

  const normalized = normalizeData(key, data);
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2));
  return normalized;
}

function sanitizeUser(user) {
  const base = clone(config.economy.defaultUser);
  const merged = {
    ...base,
    ...(user || {})
  };

  merged.balance = Math.max(0, sanitizeInteger(merged.balance, base.balance));
  merged.bank = Math.max(0, sanitizeInteger(merged.bank, base.bank));
  merged.level = Math.max(1, sanitizeInteger(merged.level, base.level));
  merged.xp = Math.max(0, sanitizeInteger(merged.xp, base.xp));
  merged.totalWon = Math.max(0, sanitizeInteger(merged.totalWon, base.totalWon));
  merged.totalLost = Math.max(0, sanitizeInteger(merged.totalLost, base.totalLost));
  merged.gamesPlayed = Math.max(0, sanitizeInteger(merged.gamesPlayed, base.gamesPlayed));
  merged.prestige = Math.max(0, sanitizeInteger(merged.prestige, base.prestige));
  merged.dailyCooldown = Math.max(0, sanitizeInteger(merged.dailyCooldown, 0));
  merged.bio = typeof merged.bio === 'string' ? merged.bio.slice(0, 160) : '';
  merged.badges = Array.isArray(merged.badges)
    ? [...new Set(merged.badges.filter(badge => typeof badge === 'string'))]
    : [];
  merged.marriedTo = merged.marriedTo ? String(merged.marriedTo) : null;

  return merged;
}

function getUser(userId, usersData = null) {
  const users = usersData || loadData('users');
  if (!Object.prototype.hasOwnProperty.call(users, userId)) {
    return null;
  }

  users[userId] = sanitizeUser(users[userId]);
  return users[userId];
}

function createUser(userId, usersData = null) {
  const users = usersData || loadData('users');
  users[userId] = sanitizeUser(users[userId]);

  if (!usersData) {
    saveData('users', users);
  }

  return users[userId];
}

function updateUser(userId, updater, usersData = null) {
  const users = usersData || loadData('users');
  const current = createUser(userId, users);

  let nextUser;
  if (typeof updater === 'function') {
    nextUser = updater(clone(current)) || current;
  } else {
    nextUser = {
      ...current,
      ...(updater || {})
    };
  }

  users[userId] = sanitizeUser(nextUser);

  if (!usersData) {
    saveData('users', users);
  }

  return users[userId];
}

function appendLog(logsData, entry) {
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry
  };

  logsData.unshift(record);
  if (logsData.length > 5000) {
    logsData.length = 5000;
  }

  return record;
}

async function withData(callback) {
  const run = async () => {
    ensureDataFiles();

    const store = {
      users: loadData('users'),
      inventory: loadData('inventory'),
      cooldowns: loadData('cooldowns'),
      logs: loadData('logs')
    };

    const result = await callback(store);

    saveData('users', store.users);
    saveData('inventory', store.inventory);
    saveData('cooldowns', store.cooldowns);
    saveData('logs', store.logs);

    return result;
  };

  const next = writeQueue.then(run, run);
  writeQueue = next.catch(() => undefined);
  return next;
}

module.exports = {
  DATA_DIR,
  DATA_FILES,
  ensureDataFiles,
  loadData,
  saveData,
  getUser,
  createUser,
  updateUser,
  appendLog,
  withData
};
