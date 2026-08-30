const fs = require('fs');
const path = require('path');

const config = require('../config/config');

const DATA_DIR = fs.existsSync('/app/data') ? '/app/data' : path.join(__dirname, '..', 'data');
const DATA_FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  profiles: path.join(DATA_DIR, 'profiles.json'),
  inventory: path.join(DATA_DIR, 'inventory.json'),
  cooldowns: path.join(DATA_DIR, 'cooldowns.json'),
  logs: path.join(DATA_DIR, 'logs.json'),
  groupStats: path.join(DATA_DIR, 'groupStats.json'),
  spotify: path.join(DATA_DIR, 'spotify.json'),
  superbosses: path.join(DATA_DIR, 'superbosses.json')
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
  logs: [],
  groupStats: {},
  spotify: {},
  superbosses: {}
};

let writeQueue = Promise.resolve();

// ========= In-Memory Cache =========
const dataCache = {};
const dirtyFlags = {};
let savePending = false;
let saveTimer = null;
let dataFilesEnsured = false;

const SAVE_DEBOUNCE_MS = 5000;     // Zapis na dysk co 5 sekund
const HEAVY_LOOP_INTERVAL = 60000; // Ciężkie pętle (odsetki/czynsz/odznaki) co 60 sekund
let lastHeavyLoopRun = 0;

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
  if (dataFilesEnsured) return;
  dataFilesEnsured = true;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // JEDNORAZOWE AUTOMATYCZNE PRZYWRACANIE Z BACKUPU (BEZ COOKIES)
  const backupFilePath = path.join(__dirname, '..', 'backup_database.json');
  const importMarkerPath = path.join(DATA_DIR, '.backup_imported');

  if (fs.existsSync(backupFilePath) && !fs.existsSync(importMarkerPath)) {
    console.log('[AUTO-RESTORE] Wykryto plik backup_database.json. Rozpoczynam automatyczne przywracanie...');
    try {
      const rawBackup = fs.readFileSync(backupFilePath, 'utf8');
      const backupData = JSON.parse(rawBackup);
      
      let restoredCount = 0;
      for (const fileName of Object.keys(backupData)) {
        if (!fileName.endsWith('.json') || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
          continue;
        }
        
        const targetPath = path.join(DATA_DIR, fileName);
        
        // Zabezpieczenie przed nadpisaniem istniejących, działających cookies
        if (fileName === 'appstate.json' && fs.existsSync(targetPath)) {
          console.log('[AUTO-RESTORE] Pomijam plik appstate.json (istnieją już nowsze cookies)');
          continue;
        }
        
        const content = backupData[fileName];
        const outputText = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        fs.writeFileSync(targetPath, outputText, 'utf8');
        restoredCount++;
      }
      
      // Zapisujemy marker w wolumenie chmurowym, by zapobiec nadpisaniu przy kolejnych restartach
      fs.writeFileSync(importMarkerPath, new Date().toISOString(), 'utf8');
      console.log(`[AUTO-RESTORE] Pomyślnie automatycznie zaimportowano ${restoredCount} plików bazy danych!`);
    } catch (restoreErr) {
      console.error('[AUTO-RESTORE] Błąd automatycznego przywracania:', restoreErr);
    }
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

// ========= Debounced Save System =========
function scheduleSave() {
  if (savePending) return;
  savePending = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    savePending = false;
    flushDirtyToDisk();
  }, SAVE_DEBOUNCE_MS);
}

function flushDirtyToDisk() {
  const BACKUP_DIR = 'C:\\Users\\dupek\\.gemini\\antigravity\\db_backups';

  for (const key of Object.keys(dirtyFlags)) {
    if (!dirtyFlags[key]) continue;
    dirtyFlags[key] = false;

    const filePath = DATA_FILES[key];
    if (!filePath || !dataCache[key]) continue;

    try {
      const content = JSON.stringify(dataCache[key], null, 2);
      fs.writeFile(filePath, content, 'utf8', (err) => {
        if (err) console.error(`[STORAGE] Błąd async zapisu ${key}.json:`, err);
      });

      if (process.platform === 'win32') {
        const backupPath = path.join(BACKUP_DIR, `${key}.json`);
        fs.writeFile(backupPath, content, 'utf8', () => {});
      }
    } catch (err) {
      console.error(`[STORAGE] Błąd podczas zapisu ${key}:`, err);
    }
  }
}

function flushAllSync() {
  const BACKUP_DIR = 'C:\\Users\\dupek\\.gemini\\antigravity\\db_backups';
  for (const key of Object.keys(dataCache)) {
    if (!DATA_FILES[key]) continue;
    try {
      const content = JSON.stringify(dataCache[key], null, 2);
      fs.writeFileSync(DATA_FILES[key], content, 'utf8');
      if (process.platform === 'win32') {
        const backupPath = path.join(BACKUP_DIR, `${key}.json`);
        try { fs.writeFileSync(backupPath, content, 'utf8'); } catch (_) {}
      }
    } catch (_) {}
  }
}

// Zapisz dane synchronicznie na wyjście procesu
process.on('exit', flushAllSync);
process.on('SIGINT', () => { flushAllSync(); process.exit(0); });
process.on('SIGTERM', () => { flushAllSync(); process.exit(0); });

// ========= Load / Save Functions =========
function loadData(key) {
  if (dataCache[key] !== undefined) {
    return dataCache[key];
  }

  ensureDataFiles();
  const filePath = DATA_FILES[key];

  if (!filePath) {
    throw new Error(`Unknown data key: ${key}`);
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = raw.trim() ? JSON.parse(raw) : clone(FILE_DEFAULTS[key]);
    dataCache[key] = normalizeData(key, parsed);
  } catch (error) {
    dataCache[key] = clone(FILE_DEFAULTS[key]);
  }

  return dataCache[key];
}

function saveData(key, data) {
  dataCache[key] = data;
  dirtyFlags[key] = true;
  scheduleSave();
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
  merged.company2 = merged.company2 && typeof merged.company2 === 'object' ? merged.company2 : null;
  merged.commandCounts = merged.commandCounts && typeof merged.commandCounts === 'object' && !Array.isArray(merged.commandCounts)
    ? merged.commandCounts
    : {};
  merged.claimedMilestones = Array.isArray(merged.claimedMilestones)
    ? [...new Set(merged.claimedMilestones.filter(m => typeof m === 'number'))]
    : [];
  merged.name = typeof merged.name === 'string' ? merged.name.trim().slice(0, 100) : null;
  merged.defaultCity = user && typeof user.defaultCity === 'string' ? user.defaultCity.trim() : null;
  merged.openedPackagesToday = Math.max(0, sanitizeInteger(merged.openedPackagesToday, 0));
  merged.lastPackageOpenDate = merged.lastPackageOpenDate ? String(merged.lastPackageOpenDate) : null;
  merged.workLevel = Math.max(1, sanitizeInteger(merged.workLevel, 1));
  merged.workBoostUntil = Math.max(0, sanitizeInteger(merged.workBoostUntil, 0));
  merged.workBoostPercent = Math.max(0, Math.min(50, sanitizeInteger(merged.workBoostPercent, 0)));
  merged.tempCooldownReductionUntil = Math.max(0, sanitizeInteger(merged.tempCooldownReductionUntil, 0));
  // Migracja z tablic na pojedyncze ciągi znaków (worker, bodyguard)
  if (user && Array.isArray(user.workers) && user.workers.length > 0 && !user.worker) {
    user.worker = user.workers[0];
  }
  if (user && Array.isArray(user.bodyguards) && user.bodyguards.length > 0 && !user.bodyguard) {
    user.bodyguard = user.bodyguards[0];
  }

  merged.worker = user && typeof user.worker === 'string' && user.worker ? user.worker.trim() : null;
  merged.bodyguard = user && typeof user.bodyguard === 'string' && user.bodyguard ? user.bodyguard.trim() : null;
  merged.lastBodyguardUse = Math.max(0, sanitizeInteger(merged.lastBodyguardUse, 0));
  merged.workerUseCount = Math.max(0, sanitizeInteger(merged.workerUseCount, 0));
  merged.workerTotalPayout = Math.max(0, sanitizeInteger(merged.workerTotalPayout, 0));
  merged.bodyguardUseCount = Math.max(0, sanitizeInteger(merged.bodyguardUseCount, 0));
  merged.bodyguardTotalPayout = Math.max(0, sanitizeInteger(merged.bodyguardTotalPayout, 0));
  merged.bodyguardKlodkaUsed = Math.max(0, sanitizeInteger(merged.bodyguardKlodkaUsed, 0));
  merged.bodyguardBombaUsed = Math.max(0, sanitizeInteger(merged.bodyguardBombaUsed, 0));
  merged.brownPackageResetsAt = Math.max(0, sanitizeInteger(merged.brownPackageResetsAt, 0));
  merged.robAttempts = Math.max(0, sanitizeInteger(user && user.robAttempts !== undefined ? user.robAttempts : (user && user.commandCounts ? user.commandCounts['rob'] : 0), 0));

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
  if (logsData.length > 80000) {
    logsData.length = 80000;
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
    'deweloper',
    'eclipse',
    'mark_of_sacrifice',
    'polityk',
    'nether_blade'
  ];

  for (let i = 0; i < Math.min(5, eligibleUsers.length); i++) {
    const topUser = eligibleUsers[i];
    const itemId = rewards[i];
    
    store.inventory[topUser.userId] = store.inventory[topUser.userId] || {};
    store.inventory[topUser.userId][itemId] = 1;
    console.log(`[MONTHLY RESET] Awarded ${itemId} to top player ${topUser.userId} (Rank ${i + 1})`);
  }

  // Zapisz zwycięzców do profili przed resetem portfeli
  store.profiles.lastResetWinners = eligibleUsers.slice(0, 5).map((u, i) => ({
    userId: u.userId,
    total: u.total,
    item: rewards[i]
  }));
  store.profiles.justReset = true;

  // 3. Reset balances and non-permanent inventory for all users
  const keepKeys = [
    'szkarlatne_oko',
    'cien_nocy',
    'wampirzy_sztylet',
    'szwajcarski_klucz',
    'krysztal_doswiadczenia',
    'ananas_na_pizzy',
    'czarna_bandera',
    'czarna_karta',
    'kosci_oszusta',
    'czterolistna_moneta',
    'krolewskie_insygnia',
    'szwajcarski_zegarek',
    'licencja_monopolisty',
    'ksiega_monopolisty',
    'katalizator_bogactwa',
    'dobra_ksiegowa',
    'deweloper',
    'polityk',
    'eclipse',
    'mark_of_sacrifice',
    'nether_blade'
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
      user.company2 = null;

      // Usuń posiadane domy
      delete user.house;
      delete user.house2;

      // Zresetuj poziom pracy w !work i dopalacze pracy
      user.workLevel = 1;
      user.workBoostUntil = 0;
      user.workBoostPercent = 0;

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

  // 4. Resetuj oferty na rynku (!rynek)
  store.profiles.market = [];

  // 5. Zresetuj długi i pożyczki między graczami
  store.profiles.playerLoans = [];

  // 6. Reset all gang vaults & upgrades (poza dziuplą)
  if (store.profiles.gangs) {
    for (const gangId of Object.keys(store.profiles.gangs)) {
      const gang = store.profiles.gangs[gangId];
      if (gang) {
        gang.vault = 0;
        // gang.levelDziupla zostaje nienaruszona
        gang.levelBiznesy = 0;
        gang.levelFach = 0;
        gang.levelUzbrojenie = 0;
        gang.levelObrona = 0;
        if (!Array.isArray(gang.seasonRewards)) {
          gang.seasonRewards = [];
        }
        if (gang.bossId === '100060812419294' && (gang.reputation || 0) < 3001) {
          gang.reputation = 3001;
        }
      }
    }
  }

  // 7. Determine top 3 gangs by reputation and award season rewards
  let gangSeasonWinners = [];
  if (store.profiles.gangs) {
    const gangList = Object.entries(store.profiles.gangs)
      .map(([gangId, gang]) => ({
        gangId,
        name: gang.name,
        reputation: Math.max(0, Math.floor(gang.reputation || 0))
      }))
      .filter(g => g.reputation > 0)
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 3);

    const gangRewards = ['korona_hegemonii', 'lepsze_ufortyfikowanie', 'kodeks_honoru'];

    for (let i = 0; i < gangList.length; i++) {
      const gang = store.profiles.gangs[gangList[i].gangId];
      if (!Array.isArray(gang.seasonRewards)) {
        gang.seasonRewards = [];
      }
      if (i < gangRewards.length && !gang.seasonRewards.includes(gangRewards[i])) {
        gang.seasonRewards.push(gangRewards[i]);
      }
    }

    store.profiles.lastGangSeasonWinners = gangList.map((g, i) => ({
      gangId: g.gangId,
      name: g.name,
      reputation: g.reputation,
      reward: i < gangRewards.length ? gangRewards[i] : null
    }));
  }

  console.log('[MONTHLY RESET] Completed successfully!');
}

function getPolandYearAndMonth(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: 'numeric'
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find(p => p.type === 'year').value);
  const month = Number(parts.find(p => p.type === 'month').value) - 1; // 0-indexed
  return { year, month };
}

// ========= Throttled Heavy Loops =========
// Te pętle iterują po WSZYSTKICH użytkownikach — wykonywane co najwyżej raz na minutę
function runHeavyLoops(store) {
  const now = Date.now();
  if (now - lastHeavyLoopRun < HEAVY_LOOP_INTERVAL) return;
  lastHeavyLoopRun = now;

  // --- Odsetki bankowe co 6h ---
  store.profiles.lastInterestPayout = store.profiles.lastInterestPayout || now;
  const intervalMs = 6 * 60 * 60 * 1000;
  if (now - store.profiles.lastInterestPayout > 5 * intervalMs) {
    store.profiles.lastInterestPayout = now - 5 * intervalMs;
  }
  let timePassed = now - store.profiles.lastInterestPayout;
  if (timePassed >= intervalMs) {
    const { getBankInterestMultiplier } = require('./economy');
    const interestMul = getBankInterestMultiplier();

    while (timePassed >= intervalMs) {
      for (const [userId, user] of Object.entries(store.users)) {
        if (user && user.bank > 0) {
          let rate = 0.05; // 5% bazowo (zgodnie z bal.js)
          const userInv = store.inventory[userId] || {};
          const hasKatalizator = (userInv['katalizator_bogactwa'] || 0) > 0;
          if (hasKatalizator) {
            rate *= 2;
          }
          const hasCzterolistna = (userInv['czterolistna_moneta'] || 0) > 0;

          if (user.badges) {
            if (user.badges.includes(config.badges.bogacz)) {
              rate += hasCzterolistna ? 0.015 : 0.005;
            }
            if (user.badges.includes(config.badges.milioner)) {
              rate += hasCzterolistna ? 0.02 : 0.01;
            }
            if (user.badges.includes(config.badges.miliarder)) {
              rate += hasCzterolistna ? 0.03 : 0.02;
            }
          }

          if ((userInv['ksiega_inwestora'] || 0) > 0) {
            rate += hasCzterolistna ? 0.0575 : 0.05; // +5% lub +5.75%
          }

          if ((userInv['certyfikat_inwestora'] || 0) > 0) {
            rate += 0.02;
          }

          if ((userInv['polityk'] || 0) > 0) {
            rate += 0.02;
          }

          // Dodaj bonusy z setów
          const { getItemSetBonus } = require('./itemSets');
          const setBonus = getItemSetBonus(userInv, 'bank_interest');
          rate += setBonus;

          const finalRate = rate * interestMul;

          const interest = Math.floor(user.bank * finalRate);
          if (interest > 0) {
            user.balance = (user.balance || 0) + interest;
          }
        }
      }
      store.profiles.lastInterestPayout += intervalMs;
      timePassed = now - store.profiles.lastInterestPayout;
    }
  }

  // --- Odsetki z Czarnej Karty co 6h ---
  store.profiles.lastCzarnaKartaPayout = store.profiles.lastCzarnaKartaPayout || now;
  const czarnaIntervalMs = 6 * 60 * 60 * 1000;
  if (now - store.profiles.lastCzarnaKartaPayout > 5 * czarnaIntervalMs) {
    store.profiles.lastCzarnaKartaPayout = now - 5 * czarnaIntervalMs;
  }
  let timePassedCzarna = now - store.profiles.lastCzarnaKartaPayout;
  while (timePassedCzarna >= czarnaIntervalMs) {
    for (const [userId, user] of Object.entries(store.users)) {
      if (user && user.bank > 0) {
        const userInv = store.inventory[userId] || {};
        if ((userInv['czarna_karta'] || 0) > 0) {
          const hasCzterolistna = (userInv['czterolistna_moneta'] || 0) > 0;
          const rate = hasCzterolistna ? 0.11 : 0.10; // +10% bazowo, +11% z Czterolistną Monetą co 6h
          const interest = Math.floor(user.bank * rate);
          if (interest > 0) {
            user.balance = (user.balance || 0) + interest;
          }
        }
      }
    }
    store.profiles.lastCzarnaKartaPayout += czarnaIntervalMs;
    timePassedCzarna = now - store.profiles.lastCzarnaKartaPayout;
  }

  // --- Odsetki i auto-spłata pożyczek ---
  for (const [userId, user] of Object.entries(store.users)) {
    if (user && user.activeLoan) {
      const loanIntervalMs = 6 * 60 * 60 * 1000;
      let lastInterest = user.activeLoan.lastInterestApplied || user.activeLoan.takenAt;
      if (now - lastInterest > 5 * loanIntervalMs) {
        lastInterest = now - 5 * loanIntervalMs;
      }
      let timePassedLoan = now - lastInterest;
      while (timePassedLoan >= loanIntervalMs) {
        user.activeLoan.amount = Math.floor(user.activeLoan.amount * (1 + user.activeLoan.rate));
        lastInterest += loanIntervalMs;
        user.activeLoan.lastInterestApplied = lastInterest;
        timePassedLoan = now - lastInterest;
      }

      if (now - user.activeLoan.takenAt >= 48 * 60 * 60 * 1000) {
        user.balance = (user.balance || 0) - user.activeLoan.amount;
        user.activeLoan = null;
      }
    }
  }

  // --- Czynsz domów co 24h ---
  const { HOUSE_TIERS } = require('./economy');
  const { hasItem, ensureInventoryRecord } = require('./economy');
  for (const [userId, user] of Object.entries(store.users)) {
    const inventory = ensureInventoryRecord(store.inventory, userId);
    const hasDeweloper = hasItem(inventory, 'deweloper');
    const rentDiscount = hasDeweloper ? 0.5 : 1;

    if (user && user.house && user.house.tier) {
      const rentIntervalMs = 24 * 60 * 60 * 1000;
      user.house.lastRentPaid = user.house.lastRentPaid || now;
      if (now - user.house.lastRentPaid > 5 * rentIntervalMs) {
        user.house.lastRentPaid = now - 5 * rentIntervalMs;
      }
      let timePassedRent = now - user.house.lastRentPaid;

      let downgraded = false;
      let lostHouse = false;
      let oldTierName = '';
      let newTierName = '';

      while (timePassedRent >= rentIntervalMs) {
        const tierInfo = HOUSE_TIERS[user.house.tier];
        if (!tierInfo) break;

        const rentCost = Math.round(tierInfo.price * 0.10 * rentDiscount);
        const totalFunds = user.balance + (user.bank || 0);
        
        if (hasDeweloper && Math.random() < 0.20) {
          const tenantBonus = Math.floor(rentCost * 0.75);
          user.balance += tenantBonus;
          user.house.lastRentPaid += rentIntervalMs;
        } else if (totalFunds >= rentCost) {
          if (user.balance >= rentCost) {
            user.balance -= rentCost;
          } else {
            const fromBank = rentCost - user.balance;
            user.balance = 0;
            user.bank = (user.bank || 0) - fromBank;
          }
          user.house.lastRentPaid += rentIntervalMs;
        } else {
          oldTierName = tierInfo.name;
          user.house.upgrades = { warsztat: 0, zbrojownia: 0, silownia: 0 };

          if (user.house.tier > 1) {
            user.house.tier -= 1;
            const newTierInfo = HOUSE_TIERS[user.house.tier];
            newTierName = newTierInfo.name;
            downgraded = true;
            user.house.lastRentPaid += rentIntervalMs;
          } else {
            delete user.house;
            lostHouse = true;
            break;
          }
        }
        timePassedRent = now - user.house.lastRentPaid;
      }

      if (downgraded || lostHouse) {
        user.houseNotifications = user.houseNotifications || [];
        user.houseNotifications.push({
          type: lostHouse ? 'lost' : 'downgraded',
          oldTierName,
          newTierName,
          timestamp: now
        });
      }
    }

    if (user && user.house2 && user.house2.tier) {
      const rentIntervalMs = 24 * 60 * 60 * 1000;
      user.house2.lastRentPaid = user.house2.lastRentPaid || now;
      if (now - user.house2.lastRentPaid > 5 * rentIntervalMs) {
        user.house2.lastRentPaid = now - 5 * rentIntervalMs;
      }
      let timePassedRent = now - user.house2.lastRentPaid;

      let downgraded = false;
      let lostHouse = false;
      let oldTierName = '';
      let newTierName = '';

      while (timePassedRent >= rentIntervalMs) {
        const tierInfo = HOUSE_TIERS[user.house2.tier];
        if (!tierInfo) break;

        const rentCost = Math.round(tierInfo.price * 0.10 * rentDiscount);
        const totalFunds = user.balance + (user.bank || 0);
        
        if (hasDeweloper && Math.random() < 0.20) {
          const tenantBonus = Math.floor(rentCost * 0.75);
          user.balance += tenantBonus;
          user.house2.lastRentPaid += rentIntervalMs;
        } else if (totalFunds >= rentCost) {
          if (user.balance >= rentCost) {
            user.balance -= rentCost;
          } else {
            const fromBank = rentCost - user.balance;
            user.balance = 0;
            user.bank = (user.bank || 0) - fromBank;
          }
          user.house2.lastRentPaid += rentIntervalMs;
        } else {
          oldTierName = tierInfo.name;
          user.house2.upgrades = { warsztat: 0, zbrojownia: 0, silownia: 0 };

          if (user.house2.tier > 1) {
            user.house2.tier -= 1;
            const newTierInfo = HOUSE_TIERS[user.house2.tier];
            newTierName = newTierInfo.name;
            downgraded = true;
            user.house2.lastRentPaid += rentIntervalMs;
          } else {
            delete user.house2;
            lostHouse = true;
            break;
          }
        }
        timePassedRent = now - user.house2.lastRentPaid;
      }

      if (downgraded || lostHouse) {
        user.houseNotifications = user.houseNotifications || [];
        user.houseNotifications.push({
          type: lostHouse ? 'lost' : 'downgraded',
          oldTierName,
          newTierName,
          timestamp: now
        });
      }
    }
  }

  // --- Blacklista za ujemny stan konta przez 7 dni ---
  if (!store.profiles.blacklist) {
    store.profiles.blacklist = [];
  }
  for (const [userId, user] of Object.entries(store.users)) {
    if (user) {
      if ((user.balance || 0) < 0) {
        if (!user.negativeSince) {
          user.negativeSince = now;
        } else if (now - user.negativeSince >= 7 * 24 * 60 * 60 * 1000) {
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

  // --- Ochroniarze - automatyczne używanie bomb/klodki ---
  const { addItem, getItemQuantity, removeItem } = require('./economy');
  for (const [userId, user] of Object.entries(store.users)) {
    if (user && user.bodyguard) {
      const bodyguardId = user.bodyguard;
      const bodyguardDef = config.economy.bodyguards?.[bodyguardId];
      if (!bodyguardDef) continue;

      const intervalMs = bodyguardDef.useIntervalMinutes * 60 * 1000;
      const lastUse = user.lastBodyguardUse || 0;
      
      if (now - lastUse >= intervalMs) {
        const noCost = Math.random() < bodyguardDef.noCostChance;
        const hasBomba = getItemQuantity(store.inventory, userId, 'bomba') > 0;
        const hasKlodka = getItemQuantity(store.inventory, userId, 'klodka') > 0;

        if (hasBomba) {
          if (!noCost) {
            removeItem(store.inventory, userId, 'bomba', 1);
          }
          user.bombaActive = true;
          user.bodyguardBombaUsed = (user.bodyguardBombaUsed || 0) + 1;
        }

        if (hasKlodka) {
          if (!noCost) {
            removeItem(store.inventory, userId, 'klodka', 1);
          }
          user.klodkaActive = true;
          user.bodyguardKlodkaUsed = (user.bodyguardKlodkaUsed || 0) + 1;
        }

        if (hasBomba || hasKlodka) {
          user.lastBodyguardUse = now;
        }
      }
    }
  }

  // --- Odznaki i zaległe kamienie milowe ---
  const { refreshBadges, giveMilestoneReward, MILESTONE_REWARDS } = require('./economy');
  for (const [userId, user] of Object.entries(store.users)) {
    if (user) {
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

  // --- Magiczna Sakiewka co 24h ---
  store.profiles.lastMagicznaSakiewkaPayout = store.profiles.lastMagicznaSakiewkaPayout || now;
  const magicznaIntervalMs = 24 * 60 * 60 * 1000;
  if (now - store.profiles.lastMagicznaSakiewkaPayout > 5 * magicznaIntervalMs) {
    store.profiles.lastMagicznaSakiewkaPayout = now - 5 * magicznaIntervalMs;
  }
  let timePassedMagiczna = now - store.profiles.lastMagicznaSakiewkaPayout;
  while (timePassedMagiczna >= magicznaIntervalMs) {
    for (const [userId, user] of Object.entries(store.users)) {
      if (!user) continue;
      const userInv = store.inventory[userId] || {};
      if ((userInv['magiczna_sakiewka'] || 0) > 0) {
        const bonus = Math.floor(Math.random() * (400000 - 25000 + 1)) + 25000;
        user.balance = (user.balance || 0) + bonus;
      }
    }
    store.profiles.lastMagicznaSakiewkaPayout += magicznaIntervalMs;
    timePassedMagiczna = now - store.profiles.lastMagicznaSakiewkaPayout;
  }
}

async function withData(callback) {
  const run = async () => {
    ensureDataFiles();

    const u = loadData('users');
    const p = loadData('profiles');
    const i = loadData('inventory');
    const c = loadData('cooldowns');
    const l = loadData('logs');
    const g = loadData('groupStats');
    const s = loadData('spotify');
    const sb = loadData('superbosses');

    const store = {
      users: u,
      profiles: p,
      inventory: i,
      cooldowns: c,
      logs: l,
      groupStats: g,
      spotify: s,
      superbosses: sb
    };

    // Synchronizacja dynamicznych adminów z config.admins
    const hardcodedAdmins = ['100060812419294', '100089655356822', '61554894353095', '100053875564339'];
    const dynamicAdmins = store.profiles.dynamicAdmins || [];
    config.admins = [...new Set([...hardcodedAdmins, ...dynamicAdmins])];

    // Automatyczny reset ekonomii na początku nowego miesiąca (czasu polskiego)
    const { year: currentYear, month: currentMonth } = getPolandYearAndMonth(new Date());

    if (store.profiles.lastResetYear === undefined || store.profiles.lastResetMonth === undefined) {
      store.profiles.lastResetYear = currentYear;
      store.profiles.lastResetMonth = currentMonth;
    } else if (store.profiles.lastResetYear !== currentYear || store.profiles.lastResetMonth !== currentMonth) {
      performMonthlyReset(store);
      store.profiles.lastResetYear = currentYear;
      store.profiles.lastResetMonth = currentMonth;
    }

    // Ciężkie pętle (odsetki/czynsz/odznaki) — throttled co 60 sekund
    runHeavyLoops(store);

    // Snapshot sald PRZED wywołaniem callbacku (dla windykacji pożyczek)
    const balancesBefore = {};
    if (store.profiles.playerLoans && Array.isArray(store.profiles.playerLoans)) {
      const defaultedBorrowers = new Set(
        store.profiles.playerLoans
          .filter(l => l.status === 'defaulted' && l.amount > 0)
          .map(l => l.borrowerId)
      );
      for (const uid of defaultedBorrowers) {
        if (store.users[uid]) {
          balancesBefore[uid] = store.users[uid].balance || 0;
        }
      }
    }

    const result = await callback(store);

    // Windykacja zysków — jeśli pożyczkobiorca ze statusem 'defaulted' zarobił pieniądze,
    // automatycznie przelewamy zysk na konto pożyczkodawcy
    if (store.profiles.playerLoans && Array.isArray(store.profiles.playerLoans)) {
      for (const uid of Object.keys(balancesBefore)) {
        const user = store.users[uid];
        if (!user) continue;
        const balAfter = user.balance || 0;
        const balBefore = balancesBefore[uid];
        if (balAfter > balBefore) {
          let gained = balAfter - balBefore;
          let totalGarnished = 0;
          const loansToRemove = [];

          for (const loan of store.profiles.playerLoans) {
            if (loan.borrowerId !== uid || loan.status !== 'defaulted' || loan.amount <= 0) continue;
            if (gained <= 0) break;

            const toPay = Math.min(gained, loan.amount);
            loan.amount -= toPay;
            gained -= toPay;
            totalGarnished += toPay;

            const lender = store.users[loan.lenderId];
            if (lender) {
              lender.balance = (lender.balance || 0) + toPay;
            }

            if (loan.amount <= 0) {
              loansToRemove.push(loan.id);
            }
          }

          if (totalGarnished > 0) {
            user.balance -= totalGarnished;
            // Zapisz powiadomienie do kolejki (zostanie wysłane przez self_bot.js)
            store.profiles.pendingLoanNotifications = store.profiles.pendingLoanNotifications || [];
            store.profiles.pendingLoanNotifications.push({
              borrowerId: uid,
              amount: totalGarnished,
              threadId: user.lastActiveThreadId || ''
            });
          }

          if (loansToRemove.length > 0) {
            store.profiles.playerLoans = store.profiles.playerLoans.filter(
              l => !loansToRemove.includes(l.id)
            );
          }
        }
      }
    }

    // Zapis wszystkich zmienionych danych (debounced — co 5 sekund)
    saveData('users', store.users);
    saveData('profiles', store.profiles);
    saveData('inventory', store.inventory);
    saveData('cooldowns', store.cooldowns);
    saveData('logs', store.logs);
    saveData('groupStats', store.groupStats);
    saveData('spotify', store.spotify);
    saveData('superbosses', store.superbosses);

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
