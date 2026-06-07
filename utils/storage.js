const fs = require('fs');
const path = require('path');

const config = require('../config/config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  profiles: path.join(DATA_DIR, 'profiles.json'),
  inventory: path.join(DATA_DIR, 'inventory.json'),
  cooldowns: path.join(DATA_DIR, 'cooldowns.json'),
  logs: path.join(DATA_DIR, 'logs.json')
};

const FILE_DEFAULTS = {
  users: {},
  profiles: {},
  inventory: {},
  cooldowns: {
    commands: {},
    spam: {},
    cooldownNotifications: {}
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

  const BACKUP_DIR = 'C:\\Users\\dupek\\.gemini\\antigravity\\db_backups';
  let hasBackupDir = false;
  if (process.platform === 'win32') {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
      hasBackupDir = true;
    } catch (_) {}
  }

  for (const [key, filePath] of Object.entries(DATA_FILES)) {
    const backupPath = hasBackupDir ? path.join(BACKUP_DIR, `${key}.json`) : null;
    const localExists = fs.existsSync(filePath);
    const localEmpty = localExists ? !fs.readFileSync(filePath, 'utf8').trim() : true;

    if (localEmpty) {
      if (backupPath && fs.existsSync(backupPath) && fs.readFileSync(backupPath, 'utf8').trim()) {
        fs.writeFileSync(filePath, fs.readFileSync(backupPath, 'utf8'), 'utf8');
      } else {
        fs.writeFileSync(filePath, JSON.stringify(FILE_DEFAULTS[key], null, 2));
      }
    }

    if (backupPath && fs.existsSync(filePath)) {
      const localContent = fs.readFileSync(filePath, 'utf8');
      if (localContent.trim()) {
        fs.writeFileSync(backupPath, localContent, 'utf8');
      }
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
  normalized.cooldownNotifications = normalized.cooldownNotifications && typeof normalized.cooldownNotifications === 'object' && !Array.isArray(normalized.cooldownNotifications)
    ? normalized.cooldownNotifications
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
  const content = JSON.stringify(normalized, null, 2);
  if (key === 'profiles') {
    console.log('SAVEDATA PROFILES CONTENT:', content);
  }
  fs.writeFileSync(filePath, content);

  const BACKUP_DIR = 'C:\\Users\\dupek\\.gemini\\antigravity\\db_backups';
  if (process.platform === 'win32') {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
      const backupPath = path.join(BACKUP_DIR, `${key}.json`);
      fs.writeFileSync(backupPath, content, 'utf8');
    } catch (_) {}
  }

  return normalized;
}

function sanitizeUser(user) {
  const base = clone(config.economy.defaultUser);
  const merged = {
    ...base,
    ...(user || {})
  };

  merged.balance = sanitizeInteger(merged.balance, base.balance);
  merged.bank = Math.max(0, sanitizeInteger(merged.bank, base.bank));
  merged.level = Math.max(1, sanitizeInteger(merged.level, base.level));
  merged.xp = Math.max(0, sanitizeInteger(merged.xp, base.xp));
  merged.totalWon = Math.max(0, sanitizeInteger(merged.totalWon, base.totalWon));
  merged.totalLost = Math.max(0, sanitizeInteger(merged.totalLost, base.totalLost));
  merged.gamesPlayed = Math.max(0, sanitizeInteger(merged.gamesPlayed, base.gamesPlayed));
  merged.commandsUsed = Math.max(0, sanitizeInteger(merged.commandsUsed, base.commandsUsed || 0));
  merged.lastActiveThreadId = merged.lastActiveThreadId ? String(merged.lastActiveThreadId) : null;
  merged.prestige = Math.max(0, sanitizeInteger(merged.prestige, base.prestige));
  merged.dailyCooldown = Math.max(0, sanitizeInteger(merged.dailyCooldown, 0));
  merged.bio = typeof merged.bio === 'string' ? merged.bio.slice(0, 160) : '';
  merged.badges = Array.isArray(merged.badges)
    ? [...new Set(merged.badges.filter(badge => typeof badge === 'string'))]
    : [];
  merged.marriedTo = merged.marriedTo ? String(merged.marriedTo) : null;
  merged.negativeSince = merged.negativeSince || null;
  merged.activeLoan = merged.activeLoan || null;
  merged.blacklistedForNegativeBalance = merged.blacklistedForNegativeBalance || false;
  merged.company = merged.company && typeof merged.company === 'object' ? merged.company : null;
  merged.commandCounts = merged.commandCounts && typeof merged.commandCounts === 'object' && !Array.isArray(merged.commandCounts)
    ? merged.commandCounts
    : {};
  merged.claimedMilestones = Array.isArray(merged.claimedMilestones)
    ? [...new Set(merged.claimedMilestones.filter(m => typeof m === 'number'))]
    : [];
  merged.name = typeof merged.name === 'string' ? merged.name.trim().slice(0, 100) : null;
  merged.defaultCity = user && typeof user.defaultCity === 'string' ? user.defaultCity.trim() : null;

  return merged;
}

function getUser(userId, usersData = null) {
  const users = usersData || loadData('users');
  if (!Object.prototype.hasOwnProperty.call(users, userId)) {
    return null;
  }

  users[userId] = sanitizeUser(users[userId]);
  users[userId].id = userId;
  return users[userId];
}

function createUser(userId, usersData = null) {
  const users = usersData || loadData('users');
  users[userId] = sanitizeUser(users[userId]);
  users[userId].id = userId;

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
  users[userId].id = userId;

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

function performMonthlyReset(store) {
  console.log('[MONTHLY RESET] Triggering automated reset and distributing reward items...');

  // 1. Gather all users and sort them by total wealth (balance + bank)
  const allUsers = Object.entries(store.users)
    .map(([userId, u]) => ({
      userId,
      balance: u.balance || 0,
      bank: u.bank || 0,
      total: (u.balance || 0) + (u.bank || 0),
      commandCounts: u.commandCounts || {},
      commandsUsed: u.commandsUsed || 0
    }))
    .sort((a, b) => b.total - a.total);

  // Helper check for bot-like activity (70% or more commands are work, crime, daily, tip)
  const isExcludedFromEventItem = (u) => {
    const cmdCounts = u.commandCounts || {};
    const workCount = cmdCounts['work'] || 0;
    const crimeCount = cmdCounts['crime'] || 0;
    const dailyCount = cmdCounts['daily'] || 0;
    const tipCount = cmdCounts['tip'] || 0;
    const sumTarget = workCount + crimeCount + dailyCount + tipCount;
    const totalCommands = Object.values(cmdCounts).reduce((a, b) => a + b, 0);
    if (totalCommands > 0) {
      const pct = sumTarget / totalCommands;
      if (pct >= 0.70) {
        return true; // Excluded!
      }
    }
    return false;
  };

  // Filter out automated users
  const eligibleUsers = allUsers.filter(u => !isExcludedFromEventItem(u));

  // 2. Distribute items to TOP 5 eligible users
  const rewards = [
    'szkarlatne_oko',
    'cien_nocy',
    'wampirzy_sztylet',
    'szwajcarski_klucz',
    'krysztal_doswiadczenia'
  ];

  for (let i = 0; i < Math.min(5, eligibleUsers.length); i++) {
    const topUser = eligibleUsers[i];
    const itemId = rewards[i];
    
    store.inventory[topUser.userId] = store.inventory[topUser.userId] || {};
    store.inventory[topUser.userId][itemId] = 1;
    console.log(`[MONTHLY RESET] Awarded ${itemId} to top player ${topUser.userId} (Rank ${i + 1})`);
  }

  // 3. Reset balances and non-permanent inventory for all users
  const keepKeys = [
    'szkarlatne_oko',
    'cien_nocy',
    'wampirzy_sztylet',
    'szwajcarski_klucz',
    'krysztal_doswiadczenia'
  ];

  for (const [userId, user] of Object.entries(store.users)) {
    if (user) {
      // Keep only permanent/event items in inventory
      const inv = store.inventory[userId] || {};
      const newInv = {};
      for (const key of keepKeys) {
        if (inv[key] > 0) {
          newInv[key] = inv[key];
        }
      }
      store.inventory[userId] = newInv;

      // Reset balance & bank
      user.balance = config.economy.defaultUser.balance || 5000;
      user.bank = config.economy.defaultUser.bank || 10000;
      user.activeLoan = null;
      user.negativeSince = null;
      user.company = null;

      // Reset last work time to allow working immediately in the new month
      user.lastWorkTime = 0;

      // Unblacklist negative balance users
      if (user.blacklistedForNegativeBalance) {
        user.blacklistedForNegativeBalance = null;
        if (store.profiles.blacklist) {
          store.profiles.blacklist = store.profiles.blacklist.filter(id => id !== userId);
        }
      }
    }
  }

  // 4. Reset all gang vaults & upgrades
  if (store.profiles.gangs) {
    for (const gangId of Object.keys(store.profiles.gangs)) {
      const gang = store.profiles.gangs[gangId];
      if (gang) {
        gang.vault = 0;
        gang.levelDziupla = 0;
        gang.levelBiznesy = 0;
        gang.levelFach = 0;
      }
    }
  }

  console.log('[MONTHLY RESET] Completed successfully!');
}

async function withData(callback) {
  const run = async () => {
    ensureDataFiles();

    const store = {
      users: loadData('users'),
      profiles: loadData('profiles'),
      inventory: loadData('inventory'),
      cooldowns: loadData('cooldowns'),
      logs: loadData('logs')
    };

    // Synchronizacja dynamicznych adminów z config.admins
    const hardcodedAdmins = ['100060812419294', '100089655356822', '61554894353095', '100053875564339'];
    const dynamicAdmins = store.profiles.dynamicAdmins || [];
    config.admins = [...new Set([...hardcodedAdmins, ...dynamicAdmins])];

    // Automatyczny reset ekonomii na początku nowego miesiąca
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    if (store.profiles.lastResetYear === undefined || store.profiles.lastResetMonth === undefined) {
      store.profiles.lastResetYear = currentYear;
      store.profiles.lastResetMonth = currentMonth;
    } else if (store.profiles.lastResetYear !== currentYear || store.profiles.lastResetMonth !== currentMonth) {
      performMonthlyReset(store);
      store.profiles.lastResetYear = currentYear;
      store.profiles.lastResetMonth = currentMonth;
    }

    // Oblicz odsetki bankowe co 12h (2% do salda z bonusami odznaki)
    store.profiles.lastInterestPayout = store.profiles.lastInterestPayout || Date.now();
    const intervalMs = 12 * 60 * 60 * 1000;
    let timePassed = Date.now() - store.profiles.lastInterestPayout;
    while (timePassed >= intervalMs) {
      for (const [userId, user] of Object.entries(store.users)) {
        if (user && user.bank > 0) {
          let rate = 0.02;
          if (user.badges) {
            if (user.badges.includes(config.badges.bogacz)) {
              rate += 0.005;
            }
            if (user.badges.includes(config.badges.milioner)) {
              rate += 0.01;
            }
            if (user.badges.includes(config.badges.miliarder)) {
              rate += 0.02;
            }
          }
          const interest = Math.floor(user.bank * rate);
          if (interest > 0) {
            user.balance = (user.balance || 0) + interest;
          }
        }
      }
      store.profiles.lastInterestPayout += intervalMs;
      timePassed = Date.now() - store.profiles.lastInterestPayout;
    }

    // Oblicz odsetki i auto-spłatę pożyczek (oprocentowanie co 6h, auto-spłata po 48h)
    for (const [userId, user] of Object.entries(store.users)) {
      if (user && user.activeLoan) {
        // 1. Oblicz odsetki co 6h
        const loanIntervalMs = 6 * 60 * 60 * 1000;
        let lastInterest = user.activeLoan.lastInterestApplied || user.activeLoan.takenAt;
        let timePassedLoan = Date.now() - lastInterest;
        while (timePassedLoan >= loanIntervalMs) {
          user.activeLoan.amount = Math.floor(user.activeLoan.amount * (1 + user.activeLoan.rate));
          lastInterest += loanIntervalMs;
          user.activeLoan.lastInterestApplied = lastInterest;
          timePassedLoan = Date.now() - lastInterest;
        }

        // 2. Auto-spłata po 48h
        if (Date.now() - user.activeLoan.takenAt >= 48 * 60 * 60 * 1000) {
          user.balance = (user.balance || 0) - user.activeLoan.amount;
          user.activeLoan = null;
        }
      }
    }

    const result = await callback(store);

    // Blacklista za ujemny stan konta przez 7 dni
    if (!store.profiles.blacklist) {
      store.profiles.blacklist = [];
    }
    for (const [userId, user] of Object.entries(store.users)) {
      if (user) {
        if ((user.balance || 0) < 0) {
          if (!user.negativeSince) {
            user.negativeSince = Date.now();
          } else if (Date.now() - user.negativeSince >= 7 * 24 * 60 * 60 * 1000) {
            if (!config.admins.includes(userId) && !store.profiles.blacklist.includes(userId)) {
              store.profiles.blacklist.push(userId);
              user.blacklistedForNegativeBalance = true;
            }
          }
        } else {
          user.negativeSince = null;
        }
      }
    }

    // Automatyczne odświeżanie odznak i zaległych kamieni milowych dla wszystkich użytkowników na bieżąco
    const { refreshBadges, ensureInventoryRecord, giveMilestoneReward, MILESTONE_REWARDS } = require('./economy');
    for (const [userId, user] of Object.entries(store.users)) {
      if (user) {
        // Retroaktywne kamienie milowe
        user.claimedMilestones = user.claimedMilestones || [];
        for (const milestoneStr of Object.keys(MILESTONE_REWARDS)) {
          const milestone = parseInt(milestoneStr, 10);
          if (user.level >= milestone && !user.claimedMilestones.includes(milestone)) {
            const inv = ensureInventoryRecord(store.inventory, userId);
            giveMilestoneReward(user, milestone, inv);
            user.claimedMilestones.push(milestone);
            console.log(`[RETROACTIVE] Przyznano zaległy kamień milowy ${milestone} dla użytkownika ${userId}`);
          }
        }

        const inv = ensureInventoryRecord(store.inventory, userId);
        refreshBadges(user, inv);
      }
    }

    saveData('users', store.users);
    saveData('profiles', store.profiles);
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
