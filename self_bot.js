const fs = require('fs');
const path = require('path');
const http = require('http');
const login = require('@dongdev/fca-unofficial');
const gangAI = require('./utils/gangAI');
const { saveGameSessions, loadGameSessions, restoreGameSessions } = require('./utils/gameStatePersistence');
const { DATA_DIR } = require('./utils/storage');

require('dotenv').config();

// Auto-seed disabled - data is managed manually on Railway
function ensureSeededData() {
  if (process.env.DISABLE_SEED === 'true') {
    console.log('[SEED] Seedowanie wyłączone przez DISABLE_SEED=true.');
    return;
  }

  const seedDir = path.join(__dirname, 'data_seed');
  if (!fs.existsSync(seedDir)) return;

  const seedFiles = fs.readdirSync(seedDir).filter(f => f.endsWith('.json'));
  let copied = false;

  for (const file of seedFiles) {
    if (file === 'appstate.json') continue;
    const seedPath = path.join(seedDir, file);
    const targetPath = path.join(DATA_DIR, file);
    if (!fs.existsSync(seedPath)) continue;

    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(seedPath, targetPath);
      console.log(`[SEED] Skopiowano ${file} z data_seed/ do wolumenu.`);
      copied = true;
    }
  }

  if (copied) {
    console.log('[SEED] Zainicjalizowano dane na pustym wolumenie z data_seed/.');
  }
}
ensureSeededData();

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  // Check both reason.message and reason.error (fca-unofficial uses .error property)
  const errMsg = String(reason?.message || reason?.error || reason || '');
  const errStr = typeof reason === 'object' && reason !== null ? JSON.stringify(reason) : String(reason);
  const nonFatalPatterns = [
    'MQTT client is not initialized',
    'sendMessage',
    'getThreadList',
    'getThreadInfo',
    'muteThread',
    'changeArchivedStatus',
    'addUserToGroup',
    'Invalid response data',
    'Not logged in',
    'Request failed'
  ];
  const isNonFatal = nonFatalPatterns.some(p => errMsg.includes(p) || errStr.includes(p));
  if (isNonFatal) {
    console.warn('[WARNING] Ignored non-fatal unhandled promise rejection:', errMsg);
    return;
  }
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const config = require('./config/config');
const { ensureDataFiles, withData, createUser, appendLog, loadData, saveData } = require('./utils/storage');
const { loadAllPeopleStats } = require('./utils/loadAllPeopleStats');
if (process.env.DISABLE_LOAD_ALL_STATS !== 'true') {
  loadAllPeopleStats();
}
const { checkCooldown, checkSpam } = require('./utils/cooldowns');
const { errorEmbed } = require('./utils/embeds');
const { renderPayloadToText } = require('./utils/messenger');
const { checkAndResetBalance, checkPendingBalanceBlock, checkOverdueBalanceReports } = require('./utils/balanceMonitor');
const { formatCurrency, msToReadable, hasItem, ensureInventoryRecord, getPassiveMultiplier, getCompanyPayoutMultiplier, getGlobalIncomeMultiplier, getItemUpgradeLevel, addXp, getMilestoneRewardDescription, refreshBadges, HOUSE_TIERS, UPGRADES_COSTS } = require('./utils/economy');
const { getItemSetBonus } = require('./utils/itemSets');
const { getWorkerDef, applyWorkerEffects } = require('./utils/workerEffects');
const { getCommandsByCategory, resolveCategoryInput, buildCategoryListEmbed, buildHelpListEmbed } = require('./utils/helpSystem');
const { resolvePendingBets } = require('./utils/bets');
const { intelligentCensor } = require('./utils/censorship');
const { resolveArtefaktyCategory, buildArtefaktyCategoryList, resolveGangArtefaktyCategory, buildGangArtefaktyCategoryList } = require('./utils/artefactHelpSystem');
const { getAllCrateDefinitions, getCrateOrder } = require('./utils/gangBossShop');
const { resolvePoradnikCategory, buildPoradnikListEmbed, buildPoradnikDetailEmbed, getPoradnikByCategoryAndNumber } = require('./utils/poradnikSystem');

// Zapisz referencję do territories config
const territoriesConfig = config.territories || {};

function isNotificationBlocked(threadId) {
  try {
    const profiles = loadData('profiles');
    const settings = (profiles.threadSettings || {})[threadId] || {};
    return !!settings.blockNotifications;
  } catch (_) {
    return false;
  }
}

// ========== THREAD INFO CACHE + RATE LIMITER + BACKOFF ==========
const _threadInfoCache = new Map(); // Map<threadId, { data, timestamp }>
const THREAD_CACHE_TTL = 30 * 60 * 1000; // 30 minut cache
const THREAD_API_MIN_INTERVAL = 3000; // minimum 3 sekundy między zapytaniami
let _threadApiLastCall = 0;
let _threadApiConsecutiveErrors = 0;
let _threadApiBackoffUntil = 0;
const USERNAME_CACHE_MAX = 5000;

let _originalGetThreadInfo = null;

function getThreadInfoCached(api, threadId, callback) {
  // 1. Sprawdź cache
  const cached = _threadInfoCache.get(threadId);
  if (cached && (Date.now() - cached.timestamp) < THREAD_CACHE_TTL) {
    return callback(null, cached.data);
  }

  // 2. Sprawdź circuit breaker (backoff po wielu błędach)
  if (_threadApiBackoffUntil > Date.now()) {
    const waitSec = Math.ceil((_threadApiBackoffUntil - Date.now()) / 1000);
    console.log(`[THREAD-CACHE] Backoff aktywny, pomijam zapytanie dla ${threadId} (czekam jeszcze ${waitSec}s)`);
    return callback(new Error('ThreadInfo API backoff active'), null);
  }

  // 3. Rate limit — oblicz opóźnienie
  const now = Date.now();
  const elapsed = now - _threadApiLastCall;
  const delay = Math.max(0, THREAD_API_MIN_INTERVAL - elapsed);

  setTimeout(() => {
    const getFn = _originalGetThreadInfo || api.getThreadInfo;
    if (typeof getFn !== 'function') {
      return callback(new Error('api.getThreadInfo is not a function'), null);
    }

    _threadApiLastCall = Date.now();

    getFn.call(api, threadId, (err, info) => {
      if (err) {
        _threadApiConsecutiveErrors++;
        if (_threadApiConsecutiveErrors >= 3) {
          // Exponential backoff: 30s, 60s, 120s, 240s, max 8 min
          const backoffMs = Math.min(30000 * Math.pow(2, _threadApiConsecutiveErrors - 3), 8 * 60 * 1000);
          _threadApiBackoffUntil = Date.now() + backoffMs;
          console.warn(`[THREAD-CACHE] ${_threadApiConsecutiveErrors} błędów z rzędu — backoff na ${Math.ceil(backoffMs / 1000)}s`);
        }
        return callback(err, null);
      }

      // Sukces — resetuj licznik błędów i zapisz w cache
      _threadApiConsecutiveErrors = 0;
      _threadApiBackoffUntil = 0;
      _threadInfoCache.set(threadId, { data: info, timestamp: Date.now() });
      callback(null, info);
    });
  }, delay);
}

// Wersja Promise dla async/await
function getThreadInfoCachedAsync(api, threadId) {
  return new Promise((resolve, reject) => {
    getThreadInfoCached(api, threadId, (err, info) => {
      if (err) return reject(err);
      resolve(info);
    });
  });
}
// ========== KONIEC THREAD INFO CACHE ==========

async function getRecentActiveThreads(client) {
  const stats = loadData('groupStats') || {};
  const twelveHours = 12 * 60 * 60 * 1000;
  const now = Date.now();
  return Array.from(client.activeThreadIds).filter(tId => {
    const s = stats[tId];
    return s && s.lastUpdated && (now - s.lastUpdated) <= twelveHours && (s.commandsExecuted || 0) >= 2;
  });
}

// ===== BUFOROWANIE POWIADOMIEŃ O ZAKOŃCZENIU EVENTÓW =====
let pendingExpiredEventNotifications = [];
let expiredEventNotificationTimer = null;
const EXPIRED_EVENT_NOTIFICATION_DELAY = 10000;

function queueExpiredEventNotification(eventMeta) {
  pendingExpiredEventNotifications.push(eventMeta);

  if (expiredEventNotificationTimer) {
    clearTimeout(expiredEventNotificationTimer);
  }

  expiredEventNotificationTimer = setTimeout(sendBufferedExpiredEventNotifications, EXPIRED_EVENT_NOTIFICATION_DELAY);
}

async function sendBufferedExpiredEventNotifications() {
  if (pendingExpiredEventNotifications.length === 0) {
    return;
  }

  const events = pendingExpiredEventNotifications;
  pendingExpiredEventNotifications = [];
  expiredEventNotificationTimer = null;

  const typeNames = { xp: '⚡ XP', casino: '🎰 Kasyno', items: '📦 Itemy', cooldowns: '⚡ Szybsze cooldowny', shop_discount: '🛒 Przecena w sklepie', bank_interest: '🏦 Bankowy Raj', crime_luck: '🌑 Czarna Godzina', company_payout: '🪙 Midasowy Dotyk' };
  const lines = events.map(e => {
    const name = typeNames[e.type] || e.type;
    return `🔴 ${name} x${e.multiplier}`;
  });

  const notifyMsg = `ℹ️ **EVENTY ZAKOŃCZONE!** ℹ️\n\n${lines.join('\n')}\n\nWskaźniki gry wróciły do normy. Dziękujemy za udział!\n\nℹ️ Aby wyłączyć powiadomienia wpisz !zakaz powiadomienia`;

  try {
    if (client.api) {
      const targets = await getRecentActiveThreads(client);
      for (const t of targets) {
        if (isNotificationBlocked(t)) continue;
        try {
          client.api.sendMessage(notifyMsg, t);
        } catch (err) {
          console.error('[EVENTS] Błąd wysyłania zbiorczego powiadomienia o zakończeniu eventów:', err);
        }
      }
    }
  } catch (err) {
    console.error('[EVENTS] Błąd podczas przygotowywania powiadomienia o zakończeniu eventów:', err);
  }
}
// ===== KONIEC BUFOROWANIA POWIADOMIEŃ O ZAKOŃCZENIU EVENTÓW =====

async function handleBailResponse(client, message, pendingBail, action) {
  const authorId = message.author.id;
  client.pendingBails.delete(authorId);
  clearTimeout(pendingBail.timeout);

  if (action === 'stop') {
    await message.reply('❌ Wykup został anulowany.');
    return;
  }

  if (action === 'wykup') {
    const mentioned = message.mentions && message.mentions.users && typeof message.mentions.users.first === 'function' ? message.mentions.users.first() : null;
    const mentionedId = mentioned ? String(mentioned.id) : null;
    if (mentionedId && mentionedId !== String(pendingBail.targetId)) {
      await message.reply('❌ Oznaczyłeś złego gracza.');
      return;
    }

    const bailResult = await withData(store => {
      const target = store.users[pendingBail.targetId];
      if (!target || !target.jailUntil || target.jailUntil <= Date.now()) {
        return { error: '❌ Ten gracz już nie jest w więzieniu.' };
      }
      const user = store.users[authorId];
      if (!user || user.balance < pendingBail.cost) {
        return { error: '❌ Nie posiadasz wystarczającej ilości VicCoinów.' };
      }
      user.balance -= pendingBail.cost;
      target.jailUntil = 0;
      return { ok: true, cost: pendingBail.cost, targetName: target.name || pendingBail.targetName };
    });

    if (bailResult.error) {
      await message.reply(bailResult.error);
      return;
    }

    await message.reply(
      `🎉 Udało się wykupić @${bailResult.targetName} z więzienia!\n\n` +
      `💸 Zapłacono: **${bailResult.cost.toLocaleString()} VicCoinów**.`
    );
  }
}

// Algorytm Levenshteina do wykrywania litowek
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function normalizeText(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l");
}

function levenshteinDistance(a, b) {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = [];
  for (let i = 0; i <= bn; i++) matrix[i] = [i];
  for (let j = 0; j <= an; j++) matrix[0][j] = j;
  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[bn][an];
}

function findClosestCommand(name, commands) {
  let best = null, bestDist = Infinity;
  const seen = new Set();
  for (const [key, cmd] of commands.entries()) {
    if (seen.has(cmd.name)) continue;
    seen.add(cmd.name);
    const dist = levenshteinDistance(name, key);
    if (dist < bestDist) { bestDist = dist; best = cmd.name; }
  }
  // Sugeruj tylko jesli literowka jest mala (max 2 znaki roznic)
  return bestDist <= 2 ? best : null;
}

function checkIfRestricted(commandName, args) {
  let logicalName = commandName;
  let logicalArgs = args;

  if (['atak', 'wojna', 'haracz', 'awans'].includes(commandName)) {
    logicalName = 'gang';
    logicalArgs = [commandName === 'wojna' ? 'wojna' : commandName, ...args];
  }

  const restrictedCommands = ['daily', 'rob', 'crime', 'work', 'tip', 'marry', 'rozwod', 'duel', 'rynek'];
  if (restrictedCommands.includes(logicalName)) {
    return true;
  }
  if (logicalName === 'gang') {
    const sub = String(logicalArgs[0] || '').toLowerCase();
    const restrictedGangSubs = ['skok', 'dolacz', 'zapros', 'atak', 'wojna'];
    if (restrictedGangSubs.includes(sub)) {
      return true;
    }
  }
  return false;
}

ensureDataFiles();

const client = {
  commands: new Map(),
  config: config,
  processedMessages: new Set(),
  recentMessages: [],
  maintenanceMode: false,
  isProcessed(id) {
    if (!id) return false;
    return this.processedMessages.has(id);
  },
  markProcessed(id) {
    if (!id) return;
    this.processedMessages.add(id);
    if (this.processedMessages.size > 1000) {
      const first = this.processedMessages.values().next().value;
      this.processedMessages.delete(first);
    }
  },
  _updateUserName(userId, name) {
    if (this.userNames.has(userId)) {
      this.userNames.delete(userId);
    }
    this.userNames.set(userId, name);
    this.resolvedUserNames.add(userId);
    if (this.userNames.size > USERNAME_CACHE_MAX) {
      const oldest = this.userNames.keys().next().value;
      if (oldest) {
        this.userNames.delete(oldest);
      }
    }
  },
  marriageRequests: new Map(),
  userNames: new Map(),
  resolvedUserNames: new Set(),
  lastLotteryDraw: 0,
  lastTaxCollection: 0,
  activeThreadIds: new Set(),
  pvPrefixes: new Map(),
  async resolveUserName(apiOrUserId, maybeUserId) {
    let api = null;
    let userId = null;
    if (typeof apiOrUserId === 'object' && apiOrUserId !== null) {
      api = apiOrUserId;
      userId = maybeUserId;
    } else {
      userId = apiOrUserId;
      api = this.api;
    }
    if (this.resolvedUserNames.has(userId) && this.userNames.has(userId)) {
      this._updateUserName(userId, this.userNames.get(userId));
      return this.userNames.get(userId);
    }

    // Sprawdź najpierw w bazie danych, czy imię jest zapisane
    let dbName = null;
    try {
      const usersData = loadData('users');
      if (usersData && usersData[userId] && usersData[userId].name) {
        dbName = usersData[userId].name;
      }
    } catch (_) {}

    if (dbName) {
      this._updateUserName(userId, dbName);
      this.resolvedUserNames.add(userId);
      return dbName;
    }

    return new Promise((resolve) => {
      if (!api) {
        return resolve(this.userNames.get(userId) || `Użytkownik_${userId.slice(-6)}`);
      }
      api.getUserInfo(userId, (err, ret) => {
        if (!err && ret && ret[userId]) {
          const name = ret[userId].name || `Użytkownik_${String(userId).slice(-6)}`;
          this._updateUserName(userId, name);
          this.resolvedUserNames.add(userId);
          
          // Zapisz asynchronicznie do bazy danych
          withData(store => {
            if (store.users[userId]) {
              store.users[userId].name = name;
            }
          }).catch(console.error);

          resolve(name);
        } else {
          const fallback = this.userNames.get(userId) || `Użytkownik_${userId.slice(-6)}`;
          resolve(fallback);
        }
      });
    });
  },
  getUser(userId) {
    return null; // brak cache — komendy obsluguja fallback do UID
  }
};

function loadCommands() {
  const folderPath = path.join(__dirname, 'commands');
  const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const command = require(filePath);

    if (!command.name || typeof command.execute !== 'function') {
      console.warn(`[WARN] Invalid command file: ${file}`);
      continue;
    }

    client.commands.set(command.name, command);
    for (const alias of command.aliases || []) {
      client.commands.set(alias, command);
    }
  }
  console.log(`[SELF-BOT] Zaimplementowano ${client.commands.size} komend.`);
}

loadCommands();

const activeThreadsPath = path.join(DATA_DIR, 'active_threads.json');
try {
  if (fs.existsSync(activeThreadsPath)) {
    const savedThreads = JSON.parse(fs.readFileSync(activeThreadsPath, 'utf8'));
    if (Array.isArray(savedThreads)) {
      client.activeThreadIds = new Set(savedThreads);
    }
  }
} catch (err) {
  console.error('[SELF-BOT] Failed to load active threads:', err);
}

const processedGroupsPath = path.join(DATA_DIR, 'processed_groups.json');
try {
  if (fs.existsSync(processedGroupsPath)) {
    const savedGroups = JSON.parse(fs.readFileSync(processedGroupsPath, 'utf8'));
    if (Array.isArray(savedGroups)) {
      client.processedNewGroups = new Set(savedGroups);
    }
  }
} catch (err) {
  console.error('[SELF-BOT] Failed to load processed new groups:', err);
}
if (!client.processedNewGroups) {
  client.processedNewGroups = new Set();
}

// appstate jest wczytywany z pliku appstate.json w katalogu glownym

function getPolandOffsetMs(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const getVal = type => Number(parts.find(p => p.type === type).value);
  
  const utcDate = Date.UTC(
    getVal('year'),
    getVal('month') - 1,
    getVal('day'),
    getVal('hour'),
    getVal('minute'),
    getVal('second')
  );
  
  return utcDate - date.getTime();
}

function getMsUntilNextTaxTime() {
  const now = new Date();
  const offset = getPolandOffsetMs(now);
  const polandTime = now.getTime() + offset;
  
  const todayMidnight = new Date(polandTime);
  todayMidnight.setUTCHours(0, 0, 0, 0);
  
  const noon = todayMidnight.getTime() + 12 * 60 * 60 * 1000;
  const midnight = todayMidnight.getTime() + 24 * 60 * 60 * 1000;
  
  let nextTaxTime;
  if (polandTime < noon) {
    nextTaxTime = noon;
  } else {
    nextTaxTime = midnight;
  }
  
  const nextTaxTimeUTC = nextTaxTime - offset;
  return Math.max(0, nextTaxTimeUTC - now.getTime());
}

function getPolandDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

async function processPlayerLoansMidnight(api, client) {
  console.log('[LOANS] Running player loans midnight collection...');
  try {
    const result = await withData(store => {
      if (!store.profiles.playerLoans || !Array.isArray(store.profiles.playerLoans)) {
        return null;
      }

      const currentDateStr = getPolandDateString();
      const announcements = [];
      const loansToKeep = [];

      for (const loan of store.profiles.playerLoans) {
        if (loan.amount <= 0) {
          continue;
        }

        // Jeśli bot pobrał już wszystkie raty automatyczne, pomijamy automatyczne pobieranie o północy
        const maxAutoCollect = typeof loan.autoCollectCount === 'number' ? loan.autoCollectCount : 999;
        const autoCollected = typeof loan.autoCollectedCount === 'number' ? loan.autoCollectedCount : 0;
        
        if (autoCollected >= maxAutoCollect) {
          loansToKeep.push(loan);
          continue;
        }

        if (loan.nextCollectionDate <= currentDateStr) {
          const borrower = createUser(loan.borrowerId, store.users);
          const lender = createUser(loan.lenderId, store.users);
          const borrowerName = borrower.name || `Użytkownik_${loan.borrowerId.slice(-6)}`;
          const lenderName = lender.name || `Użytkownik_${loan.lenderId.slice(-6)}`;

          // Rata z konfiguracji
          const installmentVal = loan.installmentAmount || loan.installment || 0;
          const totalToDeduct = Math.min(installmentVal, loan.amount);

          if (borrower.balance >= totalToDeduct) {
            // Pełna spłata raty
            borrower.balance -= totalToDeduct;
            lender.balance = (lender.balance || 0) + totalToDeduct;
            loan.amount = Math.max(0, loan.amount - totalToDeduct);
            
            loan.autoCollectedCount = autoCollected + 1;
            if (typeof loan.remainingInstallments === 'number') {
              loan.remainingInstallments = Math.max(0, loan.remainingInstallments - 1);
            }

            if (loan.amount > 0) {
              const nextDate = new Date();
              const offset = getPolandOffsetMs(nextDate);
              const polTime = new Date(nextDate.getTime() + offset);
              polTime.setUTCDate(polTime.getUTCDate() + loan.frequencyDays);
              loan.nextCollectionDate = getPolandDateString(polTime);
              loansToKeep.push(loan);

              announcements.push({
                threadId: borrower.lastActiveThreadId || lender.lastActiveThreadId || '',
                msg: `💰 **POŻYCZKA - RATA POBRANA**\n` +
                     `Pobrano ratę w wysokości **${totalToDeduct.toLocaleString()} v** od **${borrowerName}** dla **${lenderName}**.\n` +
                     `📉 Pozostało do spłaty: **${loan.amount.toLocaleString()} v**.\n` +
                     `📆 Następna rata: **${loan.nextCollectionDate}**.`
              });
            } else {
              announcements.push({
                threadId: borrower.lastActiveThreadId || lender.lastActiveThreadId || '',
                msg: `🎉 **POŻYCZKA SPŁACONA!**\n` +
                     `Pożyczka gracza **${borrowerName}** wobec **${lenderName}** została w pełni spłacona!`
              });
            }
          } else {
            // Brak środków — kara
            const available = Math.max(0, borrower.balance);
            borrower.balance = 0;
            lender.balance = (lender.balance || 0) + available;

            loan.amount = Math.max(0, loan.amount - available);

            const penaltyPercent = typeof loan.penaltyRate === 'number' ? loan.penaltyRate : 0.20;
            const penaltyAmount = Math.floor(loan.amount * penaltyPercent);
            loan.amount += penaltyAmount;
            loan.status = 'defaulted';

            loan.autoCollectedCount = autoCollected + 1;
            if (typeof loan.remainingInstallments === 'number') {
              loan.remainingInstallments = Math.max(0, loan.remainingInstallments - 1);
            }

            const nextDate = new Date();
            const offset = getPolandOffsetMs(nextDate);
            const polTime = new Date(nextDate.getTime() + offset);
            polTime.setUTCDate(polTime.getUTCDate() + loan.frequencyDays);
            loan.nextCollectionDate = getPolandDateString(polTime);
            loansToKeep.push(loan);

            announcements.push({
              threadId: borrower.lastActiveThreadId || lender.lastActiveThreadId || '',
              msg: `🚨 **POŻYCZKA - KARA ZA BRAK ŚRODKÓW** 🚨\n` +
                   `Gracz **${borrowerName}** nie posiadał wystarczających środków na spłatę raty (**${totalToDeduct.toLocaleString()} v**) wobec **${lenderName}**.\n` +
                   `💸 Zabrano dostępne środki: **${available.toLocaleString()} v**.\n` +
                   `⚠️ Dług powiększony o **${Math.round(penaltyPercent * 100)}%** kary (+${penaltyAmount.toLocaleString()} v). Nowy dług: **${loan.amount.toLocaleString()} v**.\n` +
                   `🔒 Wszystkie przyszłe zyski gracza będą automatycznie zajmowane na poczet spłaty!`
            });
          }
        } else {
          loansToKeep.push(loan);
        }
      }

      store.profiles.playerLoans = loansToKeep;
      return announcements;
    });

    if (result && result.length > 0 && api) {
      for (const ann of result) {
        if (ann.threadId) {
          if (isNotificationBlocked(ann.threadId)) continue;
          api.sendMessage(ann.msg, ann.threadId);
        } else {
          const targets = Array.from(client.activeThreadIds);
          if (targets.length > 0) {
            const t = targets[0];
            if (!isNotificationBlocked(t)) {
              api.sendMessage(ann.msg, t);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[LOANS] Error in midnight loan check:', err);
  }
}

function getMsUntilNextMonthlyReset() {
  const now = new Date();
  const offset = getPolandOffsetMs(now);
  const polandTime = now.getTime() + offset;
  
  const polandDate = new Date(polandTime);
  let nextYear = polandDate.getUTCFullYear();
  let nextMonth = polandDate.getUTCMonth() + 1;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear += 1;
  }
  
  const nextResetPolandTime = Date.UTC(nextYear, nextMonth, 1, 0, 0, 0, 0);
  const nextResetUTC = nextResetPolandTime - offset;
  return Math.max(0, nextResetUTC - now.getTime());
}

function getLastTaxTime() {
  const now = new Date();
  const offset = getPolandOffsetMs(now);
  const polandTime = now.getTime() + offset;
  
  const todayMidnight = new Date(polandTime);
  todayMidnight.setUTCHours(0, 0, 0, 0);
  
  const noon = todayMidnight.getTime() + 12 * 60 * 60 * 1000;
  
  let lastTaxTime;
  if (polandTime >= noon) {
    lastTaxTime = noon;
  } else {
    lastTaxTime = todayMidnight.getTime();
  }
  
  return lastTaxTime - offset;
}

function calculateProgressiveTax(wealth, hasKsiegowa = false) {
  const brackets = [
    { min: 0, max: 500_000, rate: 0, label: 'do 500k' },
    { min: 500_000, max: 2_000_000, rate: 0.05, label: '500k-2mln' },
    { min: 2_000_000, max: 10_000_000, rate: 0.08, label: '2mln-10mln' },
    { min: 10_000_000, max: 50_000_000, rate: 0.12, label: '10mln-50mln' },
    { min: 50_000_000, max: 100_000_000, rate: 0.18, label: '50mln-100mln' },
    { min: 100_000_000, max: 200_000_000, rate: 0.25, label: '100mln-200mln' },
    { min: 200_000_000, max: 300_000_000, rate: 0.28, label: '200mln-300mln' },
    { min: 300_000_000, max: 400_000_000, rate: 0.32, label: '300mln-400mln' },
    { min: 400_000_000, max: 600_000_000, rate: 0.36, label: '400mln-600mln' },
    { min: 600_000_000, max: 800_000_000, rate: 0.40, label: '600mln-800mln' },
    { min: 800_000_000, max: 999_000_000, rate: 0.45, label: '800mln-999mln' },
    { min: 999_000_000, max: Infinity, rate: 0.50, label: '999mln+' }
  ];

  let tax = 0;
  let topLabel = brackets[0].label;
  let topRate = 0;
  for (const bracket of brackets) {
    if (wealth <= bracket.min) break;
    const taxableInThisBracket = Math.min(wealth, bracket.max) - bracket.min;
    const effectiveRate = hasKsiegowa ? Math.max(0, bracket.rate - 0.02) : bracket.rate;
    tax += taxableInThisBracket * effectiveRate;
    topLabel = bracket.label;
    topRate = effectiveRate;
  }
  return { tax: Math.round(tax), topLabel, rate: topRate };
}

function getMsUntilNextProgressiveTax() {
  const now = Date.now();
  const profiles = loadData('profiles') || {};
  const nextAt = Number(profiles.nextTaxCollectionAt || 0);
  if (!nextAt) return 0;
  return Math.max(0, nextAt - now);
}

function getMsUntilNextGangReputationDecay() {
  const now = Date.now();
  const profiles = loadData('profiles') || {};
  const nextAt = Number(profiles.nextGangReputationDecayAt || 0);
  if (!nextAt) return 0;
  return Math.max(0, nextAt - now);
}

function getMsUntilNextTerritoryRotation() {
  const now = Date.now();
  const profiles = loadData('profiles') || {};
  const territories = profiles.territories || {};
  const nextAt = Number(territories.nextRotationAt || 0);
  if (!nextAt) return 0;
  return Math.max(0, nextAt - now);
}

// ===== APPSTATE WCZYTYWANY Z PLIKU =====

let appState;
try {
  appState = JSON.parse(fs.readFileSync(path.join(__dirname, 'data_seed', 'appstate.json'), 'utf8'));
} catch (err) {
  console.error('[SELF-BOT] Blad odczytu appstate.json:', err.message);
  process.exit(1);
}

const originalWriteFileSync = fs.writeFileSync;
const originalCopyFileSync = fs.copyFileSync;
const APPSTATE_FILES = new Set([
  path.join(DATA_DIR, 'appstate.json').toLowerCase(),
  path.join(DATA_DIR, 'appstate.json.bak').toLowerCase(),
  path.join(__dirname, 'data_seed', 'appstate.json').toLowerCase(),
  path.join(__dirname, 'appstate.json').toLowerCase()
]);

function isAppStateWrite(targetPath) {
  const normalized = String(targetPath || '').toLowerCase();
  for (const forbidden of APPSTATE_FILES) {
    if (normalized === forbidden) return true;
  }
  return false;
}

fs.writeFileSync = function writeFileSync(filePath, ...args) {
  if (isAppStateWrite(filePath)) {
    console.warn('[APPSTATE-LOCK] Blokuje zapis do appstate.json:', filePath);
    return;
  }
  return originalWriteFileSync.call(fs, filePath, ...args);
};

fs.copyFileSync = function copyFileSync(src, dest, ...args) {
  if (isAppStateWrite(dest)) {
    console.warn('[APPSTATE-LOCK] Blokuje kopiowanie do appstate.json:', dest);
    return;
  }
  return originalCopyFileSync.call(fs, src, dest, ...args);
};

// ===== AUTO-COLLECT WYPŁAT Z FIRMY =====

async function autoCollectPayout(userId, api, notifyThreadId) {
  let totalCollected = 0;
  const events = [];

  await withData(store => {
    const user = store.users[userId];
    if (!user) return;

    const inventory = ensureInventoryRecord(store.inventory, userId);
    const companyMul = getCompanyPayoutMultiplier();
    const hasKsiega = hasItem(inventory, 'ksiega_monopolisty');
    const hasInsygnia = hasItem(inventory, 'krolewskie_insygnia');
    const now = Date.now();
    const cooldownMs = 3 * 3600 * 1000;

    const overrides = (store.profiles && store.profiles.chanceOverrides && store.profiles.chanceOverrides[userId]) || {};
    const breakChanceOverride = overrides['company_breakdown'];

    const slots = [
      { compObj: user.company, name: 'Pierwsza firma' },
      { compObj: user.company2, name: 'Druga firma' }
    ];

    for (const slot of slots) {
      const { compObj, name } = slot;
      if (!compObj) continue;

      const compDef = config.economy.companies[compObj.id];
      if (!compDef) continue;

      if (compObj.isBroken) continue;

      const diff = now - (compObj.lastPayout || 0);
      if (diff < cooldownMs) continue;

      if (!user.worker) {
        continue;
      }

      let payout = compDef.payout;
      if (companyMul !== 1) {
        payout = Math.floor(payout * companyMul);
      }

      const garniturBonusPct = getPassiveMultiplier(inventory, 'garnitur', 0.10);
      let garniturBonus = garniturBonusPct > 0 ? Math.floor(compDef.payout * garniturBonusPct) : 0;
      const kaczkaBonusPct = getPassiveMultiplier(inventory, 'kaczka_biznesu', 0.05);
      let kaczkaBonus = kaczkaBonusPct > 0 ? Math.floor(compDef.payout * kaczkaBonusPct) : 0;
      let ksiegaBonus = hasKsiega ? Math.floor(compDef.payout * 0.15) : 0;
      payout += garniturBonus + kaczkaBonus + ksiegaBonus;

      const globalIncomeBonus = getGlobalIncomeMultiplier(inventory);
      let globalBonus = globalIncomeBonus > 0 ? Math.floor(compDef.payout * globalIncomeBonus) : 0;
      payout += globalBonus;

      const setBonusPct = getItemSetBonus(inventory, 'firm_income');
      let setBonus = setBonusPct > 0 ? Math.floor(compDef.payout * setBonusPct) : 0;
      payout += setBonus;

      let insygniaBonus = 0;
      if (hasInsygnia) {
        const level = getItemUpgradeLevel(inventory, 'krolewskie_insygnia');
        const bonus = 0.10 + level * 0.01;
        insygniaBonus = Math.floor(payout * bonus);
        payout += insygniaBonus;
      }

      compObj.lastPayout = now;

      const workerResult = applyWorkerEffects(payout, user.worker, compDef, compObj, inventory, breakChanceOverride);
      payout = workerResult.payout;

      let bodyguardSalary = 0;
      if (user.bodyguard) {
        const bodyguardDef = config.economy.bodyguards?.[user.bodyguard];
        if (bodyguardDef) {
          bodyguardSalary = Math.floor(payout * bodyguardDef.salaryPercent);
          payout -= bodyguardSalary;
        }
      }

      user.balance += payout;
      totalCollected += payout;

      user.workerUseCount = (user.workerUseCount || 0) + 1;
      user.workerTotalPayout = (user.workerTotalPayout || 0) + (workerResult.workerSalary || 0);

      if (user.bodyguard) {
        user.bodyguardUseCount = (user.bodyguardUseCount || 0) + 1;
        user.bodyguardTotalPayout = (user.bodyguardTotalPayout || 0) + bodyguardSalary;
      }

      if (workerResult.broke) {
        events.push({ type: 'broke', label: name, emoji: compDef.emoji, companyName: compDef.name });
      }
      if (workerResult.bonusTriggered) {
        events.push({ type: 'bonus', label: name, emoji: compDef.emoji, companyName: compDef.name });
      }
      if (workerResult.skipSalary) {
        events.push({ type: 'skipSalary', label: name, emoji: compDef.emoji, companyName: compDef.name });
      }
      if (workerResult.instantRepair) {
        events.push({ type: 'instantRepair', label: name, emoji: compDef.emoji, companyName: compDef.name });
      }
      if (workerResult.repairDiscount) {
        events.push({ type: 'repairDiscount', label: name, emoji: compDef.emoji, companyName: compDef.name });
      }
    }
  });

  if (totalCollected > 0 && events.length > 0 && api && notifyThreadId) {
    const eventLabels = {
      broke: '🔴 Uległa awarii',
      bonus: '✨ Bonus zarobków aktywowany',
      skipSalary: '💼 Pracownik nie pobrał wypłaty',
      instantRepair: '🔧 Natychmiastowa naprawa',
      repairDiscount: '💰 Tania naprawa dostępna'
    };

    const lines = events.map(e => `• ${eventLabels[e.type] || e.type} w **${e.emoji} ${e.companyName}**`);
    const msg = `🏢 **Automatyczna wypłata z firmy:**\n${lines.join('\n')}\n💰 Zebrano: **${formatCurrency(totalCollected)}**`;

    try {
      api.sendMessage(msg, notifyThreadId);
    } catch (err) {
      console.error('[AUTO-COLLECT] Błąd wysyłania powiadomienia:', err);
    }
  }

  return { collected: totalCollected > 0, events };
}

// ===== KONIEC AUTO-COLLECT WYPŁAT Z FIRMY =====

// ===== KONIEC APPSTATE =====

console.log('[SELF-BOT] Logowanie do Messengera za pomoca appstate.json...');

function tryLogin(appStateObj, attemptLabel) {
  return new Promise((resolve, reject) => {
    login({ appState: appStateObj }, (loginErr, api) => {
      if (!loginErr) return resolve(api);
      reject({ error: loginErr, appState: appStateObj });
    });
  });
}

async function loginWithFallback() {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const api = await tryLogin(appState, attempt === 1 ? 'primary' : 'fallback');
      if (attempt === 2) {
        console.log('[APPSTATE] Automatycznie zastosowano zapasowe cookies z data_seed/.');
      }
      return api;
    } catch (err) {
      lastError = err;
      const msg = String(err.error || '');
      const shouldTryFallback =
        attempt === 1 &&
        (/login_blocked|USER_ID=0|auth_error|invalid session|Please log in|1357001/i.test(msg));

      if (!shouldTryFallback) break;

      try {
        const seedAppstate = path.join(__dirname, 'data_seed', 'appstate.json');
        if (fs.existsSync(seedAppstate)) {
          const fresh = JSON.parse(fs.readFileSync(seedAppstate, 'utf8'));
          appState = fresh;
          console.log('[APPSTATE] Primary cookies odrzucone przez Facebook. Używam zapasowych z data_seed/...');
        } else {
          break;
        }
      } catch (_) {
        break;
      }
    }
  }
  throw lastError?.error || new Error('Login failed');
}

loginWithFallback().then(api => {
  client.api = api;
  global.botApi = api;

  global.gangAIClient = client;
  global.danegrpAbort = global.danegrpAbort || { aborted: false };
  
  // Tryb maintenance - blokuje komendy po !spamcheck
  client.maintenanceMode = false;

  // Globally patch api.getThreadInfo with cache, rate limiting, and backoff
  _originalGetThreadInfo = api.getThreadInfo;
  api.getThreadInfo = function(threadId, callback) {
    return getThreadInfoCached(api, threadId, callback);
  };

  console.log('[SELF-BOT] Zalogowano pomyslnie! Rozpoczynanie nasluchiwania wiadomosci...');
  
  // Wczytaj zapisane sesje gier (blackjack, gielda, chicken road, wojna, rosyjska, pkn, mecz, multimecz)
  console.log('[GAME SESSIONS] Wczytywanie zapisanych sesji gier...');
  const savedSessions = loadGameSessions();
  restoreGameSessions(client, savedSessions);
  console.log('[GAME SESSIONS] Wczytano sesje:', {
    blackjack: savedSessions.activeBlackjackGames?.size || 0,
    chickenRoad: savedSessions.activeChickenRoadGames?.size || 0,
    stock: savedSessions.stockSessions?.size || 0,
    war: savedSessions.warSessions?.size || 0,
    rr: savedSessions.rrRequests?.size || 0,
    pkn: savedSessions.pknRequests?.size || 0,
    duel: savedSessions.duelRequests?.size || 0,
    mecz: savedSessions.activeMatches?.size || 0,
    meczInProgress: savedSessions.meczInProgress?.size || 0,
    multimecz: savedSessions.activeMultiMatches?.size || 0
  });
  
  // Wyłącz tryb maintenance po pełnym załadowaniu
  client.maintenanceMode = false;
  console.log('[MAINTENANCE] Tryb maintenance wyłączony - bot gotowy do pracy.');
  
  // Dodaj konto bota do grona administratorów (podadmina)
  const botId = typeof api.getCurrentUserID === 'function' ? api.getCurrentUserID() : '';
  if (botId && !config.admins.includes(botId)) {
    config.admins.push(botId);
    console.log(`[SELF-BOT] Dodano konto bota (${botId}) do grona administratorów.`);
  }

  // Zapisuj sesje gier przy wyłączeniu bota
  const handleShutdown = () => {
    console.log('[GAME SESSIONS] Zapisywanie sesji gier przed wyłączeniem...');
    saveGameSessions(client);
    console.log('[GAME SESSIONS] Sesje gier zapisane.');
    process.exit(0);
  };

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);
  process.on('exit', () => {
    console.log('[GAME SESSIONS] Zapisywanie sesji gier przy exit...');
    saveGameSessions(client);
  });

  // Pobierz nazwy dla aktywnych grup na starcie (z cache + rate limit + backoff)
  setTimeout(async () => {
    try {
      const stats = loadData('groupStats');
      const threadIds = Array.from(client.activeThreadIds || []);
      
      for (const tId of threadIds) {
        if (!stats[tId] || !stats[tId].threadName) {
          try {
            const info = await getThreadInfoCachedAsync(api, tId);
            if (info && info.name) {
              await withData(store => {
                store.groupStats = store.groupStats || {};
                store.groupStats[tId] = store.groupStats[tId] || {
                  visibleMessages: 0,
                  processedMessages: 0,
                  commandsExecuted: 0,
                  mentionsCount: 0,
                  firstUse: Date.now()
                };
                store.groupStats[tId].threadName = info.name;
                store.groupStats[tId].lastUpdated = Date.now();
              }).catch(() => null);
            }
          } catch (err) {
            // Jeśli backoff aktywny, przerywamy pętlę — nie ma sensu pytać dalej
            if (_threadApiBackoffUntil > Date.now()) {
              console.log('[SELF-BOT] Backoff aktywny — przerywam pobieranie nazw grup na starcie.');
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error('[SELF-BOT] Error loading thread names at startup:', err);
    }
  }, 10000);

  // Odzyskiwanie przerwanych zakładów meczowych/multi-meczowych po restarcie
  setTimeout(() => {
    resolvePendingBets(api).catch(err => {
      console.error('[SELF-BOT] Blad podczas odzyskiwania zakladow:', err);
    });
  }, 15000);

  // Pętla panelu administratora: heartbeat statusu + obsługa ogłoszeń i restartu z panelu (apka/)
  setInterval(() => {
    withData(store => {
      store.profiles.botStatus = {
        loggedIn: !!client.api,
        botId: botId || null,
        activeThreads: client.activeThreadIds.size,
        lastHeartbeat: Date.now()
      };
      
      // Sprawdź czy jakieś eventy wygasły
      const now = Date.now();
      const events = store.profiles.events || [];
      const expiredEvents = events.filter(e => e.endTime <= now);
      
      if (expiredEvents.length > 0) {
        store.profiles.events = events.filter(e => e.endTime > now);
      }
      
      const broadcasts = Array.isArray(store.profiles.pendingAdminBroadcasts) ? store.profiles.pendingAdminBroadcasts : [];
      store.profiles.pendingAdminBroadcasts = [];
      const restart = store.profiles.pendingAdminRestart === true;
      store.profiles.pendingAdminRestart = false;
      return { broadcasts, restart, expiredEvents };
    }).then(async ({ broadcasts, restart, expiredEvents }) => {
      // Zakolejkuj powiadomienia o zakończeniu eventów (wysyłane zbiorczo po 10s ciszy)
      for (const e of expiredEvents) {
        queueExpiredEventNotification({
          type: e.type,
          multiplier: e.multiplier
        });
      }

      for (const b of broadcasts) {
        const msg = `📢 **OGŁOSZENIE ADMINISTRACJI:**\n\n${b.message}`;
        const sendApi = client.api || global.botApi;
        if (!sendApi) continue;
        const targets = Array.from(client.activeThreadIds);
        const profiles = loadData('profiles');
        const threadSettings = profiles.threadSettings || {};
        for (const t of targets) {
          const settings = threadSettings[t] || {};
          if (settings.blockNotifications) continue;
          try { sendApi.sendMessage(msg, t); } catch (err) {
            console.error('[ADMIN-PANEL] Błąd wysyłania ogłoszenia:', err);
          }
        }
      }
      if (restart) {
        console.log('[ADMIN-PANEL] Restart zażądany z panelu — zamykanie procesu...');
        setTimeout(() => process.exit(0), 1000);
      }
    }).catch(err => console.error('[ADMIN-PANEL] Błąd pętli panelu:', err));
  }, 10000);

  setInterval(() => {
    checkOverdueBalanceReports((msg, threadId) => {
      if (client.api && !isNotificationBlocked(threadId)) client.api.sendMessage(msg, threadId);
    });
  }, 60 * 1000);

  setInterval(() => {
    if (!client.api) return;
    withData(store => {
      const users = store.users || {};
      if (!store.inventory) store.inventory = {};
      const inventory = store.inventory;
      const now = Date.now();
      const cooldownMs = 3 * 3600 * 1000;
      const companyMul = getCompanyPayoutMultiplier();
      
      for (const userId of Object.keys(users)) {
        const user = users[userId];
        if (!user || (!user.company && !user.company2)) continue;
        
        // Automatyczne zbieranie tylko dla użytkowników z pracownikami
        if (!user.worker) continue;
        
        const userInventory = ensureInventoryRecord(inventory, userId);
        const hasKsiega = hasItem(userInventory, 'ksiega_monopolisty');
        const hasInsygnia = hasItem(userInventory, 'krolewskie_insygnia');
        
        const overrides = (store.profiles && store.profiles.chanceOverrides && store.profiles.chanceOverrides[userId]) || {};
        const breakChanceOverride = overrides['company_breakdown'];
        
        const slots = [
          { compObj: user.company, name: 'Pierwsza firma' },
          { compObj: user.company2, name: 'Druga firma' }
        ];
        
        for (const slot of slots) {
          const { compObj, name } = slot;
          if (!compObj) continue;
          
          const compDef = config.economy.companies[compObj.id];
          if (!compDef) continue;
          
          if (compObj.isBroken) continue;
          
          const diff = now - (compObj.lastPayout || 0);
          if (diff < cooldownMs) continue;
          
          let payout = compDef.payout;
          if (companyMul !== 1) {
            payout = Math.floor(payout * companyMul);
          }
          
          const garniturBonusPct = getPassiveMultiplier(userInventory, 'garnitur', 0.10);
          let garniturBonus = garniturBonusPct > 0 ? Math.floor(compDef.payout * garniturBonusPct) : 0;
          const kaczkaBonusPct = getPassiveMultiplier(userInventory, 'kaczka_biznesu', 0.05);
          let kaczkaBonus = kaczkaBonusPct > 0 ? Math.floor(compDef.payout * kaczkaBonusPct) : 0;
          let ksiegaBonus = hasKsiega ? Math.floor(compDef.payout * 0.15) : 0;
          payout += garniturBonus + kaczkaBonus + ksiegaBonus;
          
          const globalIncomeBonus = getGlobalIncomeMultiplier(userInventory);
          let globalBonus = globalIncomeBonus > 0 ? Math.floor(compDef.payout * globalIncomeBonus) : 0;
          payout += globalBonus;
          
          const setBonusPct = getItemSetBonus(userInventory, 'firm_income');
          let setBonus = setBonusPct > 0 ? Math.floor(compDef.payout * setBonusPct) : 0;
          payout += setBonus;
          
          let insygniaBonus = 0;
          if (hasInsygnia) {
            const level = getItemUpgradeLevel(userInventory, 'krolewskie_insygnia');
            const bonus = 0.10 + level * 0.01;
            insygniaBonus = Math.floor(payout * bonus);
            payout += insygniaBonus;
          }
          
          compObj.lastPayout = now;
          
          const workerResult = applyWorkerEffects(payout, user.worker, compDef, compObj, userInventory, breakChanceOverride);
          payout = workerResult.payout;
          
          let bodyguardSalary = 0;
          if (user.bodyguard) {
            const bodyguardDef = config.economy.bodyguards?.[user.bodyguard];
            if (bodyguardDef) {
              bodyguardSalary = Math.floor(payout * bodyguardDef.salaryPercent);
              payout -= bodyguardSalary;
            }
          }
          
          user.balance += payout;
          
          user.workerUseCount = (user.workerUseCount || 0) + 1;
          user.workerTotalPayout = (user.workerTotalPayout || 0) + (workerResult.workerSalary || 0);
          
          if (user.bodyguard) {
            user.bodyguardUseCount = (user.bodyguardUseCount || 0) + 1;
            user.bodyguardTotalPayout = (user.bodyguardTotalPayout || 0) + bodyguardSalary;
          }
          
          const events = [];
          if (workerResult.broke) events.push({ type: 'broke', emoji: compDef.emoji, companyName: compDef.name });
          if (workerResult.bonusTriggered) events.push({ type: 'bonus', emoji: compDef.emoji, companyName: compDef.name });
          if (workerResult.skipSalary) events.push({ type: 'skipSalary', emoji: compDef.emoji, companyName: compDef.name });
          if (workerResult.instantRepair) events.push({ type: 'instantRepair', emoji: compDef.emoji, companyName: compDef.name });
          if (workerResult.repairDiscount) events.push({ type: 'repairDiscount', emoji: compDef.emoji, companyName: compDef.name });
          
          if (events.length > 0 && client.api) {
            const eventLabels = {
              broke: '🔴 Uległa awarii',
              bonus: '✨ Bonus zarobków aktywowany',
              skipSalary: '💼 Pracownik nie pobrał wypłaty',
              instantRepair: '🔧 Natychmiastowa naprawa',
              repairDiscount: '💰 Tania naprawa dostępna'
            };
            const lines = events.map(e => `• ${eventLabels[e.type] || e.type} w **${e.emoji} ${e.companyName}**`);
            const msg = `🏢 **Automatyczna wypłata z firmy:**\n${lines.join('\n')}\n💰 Zebrano: **${formatCurrency(payout)}**`;
            
            try {
              client.api.sendMessage(msg, userId);
            } catch (err) {
              console.error('[AUTO-COLLECT] Błąd wysyłania powiadomienia:', err);
            }
          }
        }
      }
    });
  }, 300 * 1000);


  const jitter = (ms, fraction = 0.1) => ms + Math.floor(Math.random() * ms * fraction);

  setTimeout(() => {
    setInterval(() => {
      const now = Date.now();
      let threadCacheCleaned = 0;
      for (const [threadId, entry] of _threadInfoCache.entries()) {
        if (now - entry.timestamp > THREAD_CACHE_TTL) {
          _threadInfoCache.delete(threadId);
          threadCacheCleaned++;
        }
      }
      if (threadCacheCleaned > 0) {
        console.log(`[MEMORY-CLEANUP] Usunięto ${threadCacheCleaned} przeterminowanych wpisów z _threadInfoCache.`);
      }
    }, 5 * 60 * 1000);
  }, jitter(5 * 60 * 1000, 0.2));

  setTimeout(() => {
    setInterval(() => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      let lastMsgCleaned = 0;
      if (client.lastNormalMessageTime) {
        for (const [userId, ts] of client.lastNormalMessageTime.entries()) {
          if (now - ts > dayMs) {
            client.lastNormalMessageTime.delete(userId);
            lastMsgCleaned++;
          }
        }
      }
      if (lastMsgCleaned > 0) {
        console.log(`[MEMORY-CLEANUP] Usunięto ${lastMsgCleaned} przeterminowanych wpisów z lastNormalMessageTime.`);
      }
    }, 30 * 60 * 1000);
  }, jitter(30 * 60 * 1000, 0.2));

  setTimeout(() => {
    setInterval(() => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      let marriageCleaned = 0;
      for (const [key, req] of client.marriageRequests.entries()) {
        if (now - (req.timestamp || 0) > dayMs) {
          client.marriageRequests.delete(key);
          marriageCleaned++;
        }
      }
      if (marriageCleaned > 0) {
        console.log(`[MEMORY-CLEANUP] Usunięto ${marriageCleaned} przeterminowanych wpisów z marriageRequests.`);
      }
    }, 60 * 60 * 1000);
  }, jitter(60 * 60 * 1000, 0.2));

  setTimeout(() => {
    setInterval(() => {
      const now = Date.now();
      const thirtyMinMs = 30 * 60 * 1000;
      let gameCleaned = 0;
      if (client.activeBlackjackGames) {
        for (const [key, game] of client.activeBlackjackGames.entries()) {
          if (now - (game.timestamp || 0) > thirtyMinMs) {
            client.activeBlackjackGames.delete(key);
            gameCleaned++;
          }
        }
      }
      if (client.activeMilionerzy) {
        for (const [key, game] of client.activeMilionerzy.entries()) {
          if (now - (game.timestamp || 0) > thirtyMinMs) {
            client.activeMilionerzy.delete(key);
            gameCleaned++;
          }
        }
      }
      if (client.activeHangman) {
        for (const [key, game] of client.activeHangman.entries()) {
          if (now - (game.timestamp || 0) > thirtyMinMs) {
            client.activeHangman.delete(key);
            gameCleaned++;
          }
        }
      }
      if (client.activePanstwaMiasta) {
        for (const [key, game] of client.activePanstwaMiasta.entries()) {
          if (now - (game.timestamp || 0) > thirtyMinMs) {
            client.activePanstwaMiasta.delete(key);
            gameCleaned++;
          }
        }
      }
      if (client.activeChickenRoadGames) {
        for (const [key, game] of client.activeChickenRoadGames.entries()) {
          if (now - (game.timestamp || 0) > thirtyMinMs) {
            client.activeChickenRoadGames.delete(key);
            gameCleaned++;
          }
        }
      }
      if (gameCleaned > 0) {
        console.log(`[MEMORY-CLEANUP] Usunięto ${gameCleaned} przeterminowanych gier.`);
        saveGameSessions(client);
      }
    }, 15 * 60 * 1000);
  }, jitter(15 * 60 * 1000, 0.2));

  setTimeout(() => {
    setInterval(async () => {
      const now = Date.now();
      const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
      let groupsCleaned = 0;
      await withData(store => {
        for (const threadId of client.processedNewGroups.entries()) {
          const stats = store.profiles && store.profiles.groupStats && store.profiles.groupStats[threadId];
          const lastActive = stats && stats.lastUpdated ? stats.lastUpdated : 0;
          if (now - lastActive > twoDaysMs) {
            client.processedNewGroups.delete(threadId);
            groupsCleaned++;
          }
        }
      });
      if (groupsCleaned > 0) {
        console.log(`[MEMORY-CLEANUP] Usunięto ${groupsCleaned} nieaktywnych wpisów z processedNewGroups.`);
      }
    }, 6 * 60 * 60 * 1000);
  }, jitter(6 * 60 * 60 * 1000, 0.2));

  setTimeout(() => {
    setInterval(async () => {
      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      let threadIdsCleaned = 0;
      await withData(store => {
        for (const threadId of client.activeThreadIds.entries()) {
          const stats = store.profiles && store.profiles.groupStats && store.profiles.groupStats[threadId];
          const lastActive = stats && stats.lastUpdated ? stats.lastUpdated : 0;
          if (now - lastActive > sevenDaysMs) {
            client.activeThreadIds.delete(threadId);
            threadIdsCleaned++;
          }
        }
      });
      if (threadIdsCleaned > 0) {
        try { fs.writeFileSync(activeThreadsPath, JSON.stringify(Array.from(client.activeThreadIds), null, 2), 'utf8'); } catch (_) {}
        console.log(`[MEMORY-CLEANUP] Usunięto ${threadIdsCleaned} nieaktywnych grup z activeThreadIds.`);
      }
    }, 24 * 60 * 60 * 1000);
  }, jitter(24 * 60 * 60 * 1000, 0.2));

  // Centralny tick gangów AI
  if (config.gangAI && config.gangAI.enabled) {
    setTimeout(async () => {
      try {
        const cfg = config.gangAI;
        await withData(store => {
          gangAI.ensureFixedAIGangs(store, cfg);
        });
        await gangAI.logAIAction('system', 'Zainicjalizowano stałe gangi AI.');
      } catch (err) {
        console.error('[GANG-AI] Błąd inicjalizacji stałych gangów AI:', err);
      }
    }, 5000);

    setInterval(async () => {
      try {
        const cfg = config.gangAI;
        const gangs = await gangAI.getAIGangs();
        const currentCount = gangs.length;

        for (const gang of gangs) {
          try {
            await gangAI.processAIGang(client, gang.id, gang, cfg);
          } catch (err) {
            console.error(`[GANG-AI] Błąd przetwarzania gangu ${gang.id}:`, err);
          }
        }

        const finalCount = await gangAI.countAIGangs();
        await gangAI.logAIAction('system', `Tick zakończony. Aktywne gangi AI: ${finalCount}`);
      } catch (err) {
        console.error('[GANG-AI] Błąd centralnego ticku:', err);
      }
    }, 5 * 60 * 1000);
  }





  async function sendPendingLoanNotifications(api) {
    try {
      const notifications = await withData(store => {
        if (!store.profiles.pendingLoanNotifications || store.profiles.pendingLoanNotifications.length === 0) {
          return null;
        }
        const list = [...store.profiles.pendingLoanNotifications];
        store.profiles.pendingLoanNotifications = [];
        return list;
      });

      if (notifications && notifications.length > 0) {
        for (const n of notifications) {
          const borrower = await client.resolveUserName(api, n.borrowerId);
          const msg = `🚨 **KOMORNIK:** Z powodu zaległości w spłacie pożyczki, zyski gracza **${borrower}** w wysokości **${n.amount.toLocaleString()} v** zostały automatycznie zajęte i przekazane pożyczkodawcy!`;
          const destThread = n.threadId || client.lastThreadId;
          if (destThread) {
            originalSendMessage.call(api, msg, destThread);
          } else {
            const targets = Array.from(client.activeThreadIds);
            if (targets.length > 0) {
              originalSendMessage.call(api, msg, targets[0]);
            }
          }
        }
      }
    } catch (err) {
      console.error('[LOANS] Błąd podczas wysyłania powiadomień komorniczych:', err);
    }
  }

  const RECENT_MESSAGES_PATH = path.join(DATA_DIR, 'recent_messages.json');
  const RECENT_MESSAGES_LIMIT = 60000;

  // Wrap api.sendMessage to send messages instantly without delay (cooldown removed)
  const originalSendMessage = api.sendMessage;
  api.sendMessage = function(message, threadID, callback, messageID) {
    if (client.api && !client.sendingLoanNotifications) {
      client.sendingLoanNotifications = true;
      sendPendingLoanNotifications(client.api).finally(() => {
        client.sendingLoanNotifications = false;
      });
    }

    const bodyStr = typeof message === 'string' ? message : (message.body || message.text || JSON.stringify(message));
    const botId = String(api.getCurrentUserID?.() || '');
    if (bodyStr && threadID && client.recentMessages) {
      client.recentMessages.push({
        ts: Date.now(),
        type: 'message',
        senderID: botId,
        body: bodyStr,
        threadId: String(threadID),
        isBot: true
      });
      if (client.recentMessages.length > RECENT_MESSAGES_LIMIT) {
        client.recentMessages = client.recentMessages.slice(-RECENT_MESSAGES_LIMIT);
      }
    }

    const wrappedCallback = typeof callback === 'function' ? function(err) {
      if (err && threadID && client.activeThreadIds && client.activeThreadIds.has(threadID)) {
        const errStr = String(err || '');
        if (errStr.includes('not in group') || errStr.includes('not a participant') || errStr.includes('not a member') || errStr.includes('Invalid thread ID')) {
          client.activeThreadIds.delete(threadID);
          try { fs.writeFileSync(activeThreadsPath, JSON.stringify(Array.from(client.activeThreadIds), null, 2), 'utf8'); } catch (_) {}
          console.log(`[MEMORY-CLEANUP] Usunięto nieaktywną grupę ${threadID} z activeThreadIds.`);
        }
      }
      if (typeof callback === 'function') callback(err);
    } : undefined;
    return originalSendMessage.call(api, message, threadID, wrappedCallback, messageID);
  };

  client.api = api;
  client.lastLotteryDraw = Date.now();

  function loadRecentMessages() {
    try {
      if (fs.existsSync(RECENT_MESSAGES_PATH)) {
        const raw = fs.readFileSync(RECENT_MESSAGES_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          client.recentMessages = parsed.slice(-RECENT_MESSAGES_LIMIT);
          console.log(`[ZAPISZ] Wczytano ${client.recentMessages.length} wiadomości z dysku`);
          return;
        }
      }
    } catch (err) {
      console.error('[ZAPISZ] Błąd wczytywania bufora:', err.message);
    }

    try {
      const logs = loadData('logs');
      const loaded = (logs || [])
        .filter(l => l && l.type === 'message' && l.userId && l.body)
        .map(l => ({
          ts: l.timestamp ? new Date(l.timestamp).getTime() : 0,
          type: 'message',
          senderID: String(l.userId),
          body: l.body,
          threadId: String(l.threadId || ''),
          isBot: false
        }))
        .sort((a, b) => a.ts - b.ts)
        .slice(-RECENT_MESSAGES_LIMIT);
      client.recentMessages = loaded;
      console.log(`[ZAPISZ] Wczytano ${loaded.length} wiadomości z logs.json`);
    } catch (err) {
      console.error('[ZAPISZ] Błąd wczytywania logs.json:', err.message);
      client.recentMessages = [];
    }
  }

  function saveRecentMessages() {
    try {
      if (!client.recentMessages || client.recentMessages.length === 0) return;
      const toSave = client.recentMessages.slice(-RECENT_MESSAGES_LIMIT);
      fs.writeFileSync(RECENT_MESSAGES_PATH, JSON.stringify(toSave, null, 2), 'utf8');
    } catch (err) {
      console.error('[ZAPISZ] Błąd zapisu bufora:', err.message);
    }
  }

  loadRecentMessages();

  setInterval(() => {
    saveRecentMessages();
  }, 5 * 60 * 1000);

  process.on('SIGINT', () => { saveRecentMessages(); process.exit(0); });
  process.on('SIGTERM', () => { saveRecentMessages(); process.exit(0); });
  process.on('exit', saveRecentMessages);

  // Funkcja do uruchamiania losowania loterii
  function startLotteryTimer() {
    setTimeout(async () => {
      if (!client.api || !client.lastThreadId) {
        startLotteryTimer(); // Spróbuj ponownie jeśli api nie jest gotowe
        return;
      }

      try {
        const drawResult = await withData(store => {
          const ticketPool = [];
          const ticketOwners = new Set();
          let totalTickets = 0;

          for (const [userId, inv] of Object.entries(store.inventory || {})) {
            const ticketCount = inv.ticket || 0;
            if (ticketCount > 0) {
              totalTickets += ticketCount;
              ticketOwners.add(userId);
              for (let i = 0; i < ticketCount; i++) {
                ticketPool.push(userId);
              }
            }
          }

          if (ticketPool.length === 0) {
            return null;
          }

          const winnerId = ticketPool[Math.floor(Math.random() * ticketPool.length)];
          const totalPrize = totalTickets * 50000;

          const winnerUser = createUser(winnerId, store.users);
          const winnerInv = store.inventory[winnerId] || {};
          let finalPrize = totalPrize;
          if (hasItem(winnerInv, 'krolewskie_insygnia')) {
            finalPrize = Math.floor(finalPrize * 1.10);
          }
          winnerUser.balance = (winnerUser.balance || 0) + finalPrize;

          for (const inv of Object.values(store.inventory || {})) {
            if (inv.ticket) {
              inv.ticket = 0;
            }
          }

          return {
            winnerId,
            totalTickets,
            totalPrize,
            finalPrize,
            ticketOwners: Array.from(ticketOwners)
          };
        });

        if (drawResult) {
          client.lastLotteryDraw = Date.now();
          const winnerName = await client.resolveUserName(client.api, drawResult.winnerId);
          const bonusText = drawResult.finalPrize > drawResult.totalPrize ? ' (w tym +10% z Królewskich Insygniów!)' : '';
           const announceMsg = 
             `🎟️ **LOSOWANIE LOTERII**\n` +
             `Łączna liczba biletów w grze: **${drawResult.totalTickets}**\n` +
             `Wygrywa: **${winnerName}**! 🎉\n` +
             `Nagroda główna: **+${drawResult.finalPrize.toLocaleString()} viccoinów** została dodana do portfela!${bonusText}\n` +
             `Wszystkie bilety zostały zresetowane. Kup nowe w sklepie za pomocą \`!sklep 3\`.\n\n` +
             `ℹ️ Aby wyłączyć powiadomienia wpisz !zakaz powiadomienia`;

          const uniqueBuyers = [...new Set(drawResult.ticketOwners || [])];
          let targets = [];
          if (uniqueBuyers.length === 1) {
            const soleBuyerId = uniqueBuyers[0];
            const buyer = await withData(store => store.users[soleBuyerId]);
            const buyerThreadId = buyer && buyer.lastActiveThreadId ? String(buyer.lastActiveThreadId) : null;
            targets = buyerThreadId ? [buyerThreadId] : (client.lastThreadId ? [client.lastThreadId] : []);
          } else {
            targets = await getRecentActiveThreads(client);
          }
          if (targets.length > 0) {
            for (const tId of targets) {
              if (isNotificationBlocked(tId)) continue;
              client.api.sendMessage(announceMsg, tId, (err) => {
                if (err) console.error('[LOTTERY] Błąd wysyłania powiadomienia:', err.message || err);
              })?.catch?.(err => {
                console.error('[LOTTERY] Błąd wysyłania powiadomienia (Promise):', err.message || err);
              });
            }
          }
        }
      } catch (err) {
        console.error('[LOTTERY] Blad podczas losowania loterii:', err);
      }

      // Rekurencyjnie uruchamiaj timer od nowa (zawsze licząc od ostatniego losowania)
      startLotteryTimer();
    }, 24 * 60 * 60 * 1000); // 24 godziny
  }

  // Uruchom timer loterii
  startLotteryTimer();

  // System podatków co 12 godzin (zawsze o północy i w południe)
  function startTaxCollection() {
    if (client.taxCollectionInProgress) return;
    client.taxCollectionInProgress = true;

    const delay = getMsUntilNextTaxTime() + 2000;

    const warningDelay = Math.max(0, delay - 15000);
    setTimeout(async () => {
      client.taxWarningActive = true;
      console.log('[TAX] Ostrzeżenie: podatki zostaną pobrane za 15 sekund. Zamykanie aktywnych gier i zwrot stawek...');
      await endAllActiveGamesAndRefund();
    }, warningDelay);

    setTimeout(async () => {
      try {
        client.taxWarningActive = false;
        const result = await withData(store => {
          let totalCollected = 0;
          const taxedUsers = [];

          for (const [userId, user] of Object.entries(store.users || {})) {
            if (user.balance > 0) {
              const userInv = store.inventory[userId] || {};
              const hasKsiegowa = (userInv['dobra_ksiegowa'] || 0) > 0;
              const hasPolityk = (userInv['polityk'] || 0) > 0;
              if (hasPolityk && Math.random() < 0.05) {
                continue;
              }
              const taxRate = hasKsiegowa ? 0.02 : 0.04;
              const tax = Math.floor(user.balance * taxRate);
              user.balance -= tax;
              totalCollected += tax;
              taxedUsers.push({
                userId,
                tax,
                newBalance: user.balance
              });
            }
          }

          return { totalCollected, taxedUsers: taxedUsers.length };
        });

        // Ustaw czas ostatniego poboru na zaokrąglony czas poboru (dokładnie 00:00 lub 12:00)
        client.lastTaxCollection = getLastTaxTime();

        if (result.totalCollected > 0) {
          const announceMsg = 
            `📊 **POBÓR PODATKÓW**\n` +
            `Pobrano podatek w wysokości: **4% salda**\n` +
            `Liczba opodatkowanych graczy: **${result.taxedUsers}**\n` +
            `Łączna kwota podatku: **${result.totalCollected.toLocaleString()} viccoinów**\n\n` +
            `ℹ️ Aby wyłączyć powiadomienia wpisz !zakaz powiadomienia`;

          const targets = Array.from(client.activeThreadIds);
          if (targets.length > 0) {
            for (const tId of targets) {
              if (isNotificationBlocked(tId)) continue;
              client.api.sendMessage(announceMsg, tId, (err) => {
                if (err) console.error('[TAX] Błąd wysyłania powiadomienia:', err.message || err);
              })?.catch?.(err => {
                console.error('[TAX] Błąd wysyłania powiadomienia (Promise):', err.message || err);
              });
            }
          } else if (client.lastThreadId) {
            if (!isNotificationBlocked(client.lastThreadId)) {
              client.api.sendMessage(announceMsg, client.lastThreadId, (err) => {
                if (err) console.error('[TAX] Błąd wysyłania powiadomienia:', err.message || err);
              })?.catch?.(err => {
                console.error('[TAX] Błąd wysyłania powiadomienia (Promise):', err.message || err);
              });
            }
          }
        }

        // Sprawdź i pobierz raty pożyczek między graczami (raz na dobę o północy)
        const currentDateStr = getPolandDateString();
        if (client.lastLoanCheckDate !== currentDateStr) {
          client.lastLoanCheckDate = currentDateStr;
          await processPlayerLoansMidnight(client.api, client);
        }
      } catch (err) {
        console.error('[TAX] Błąd podczas poboru podatków:', err);
      } finally {
        client.taxCollectionInProgress = false;
      }

      // Rekurencyjnie uruchamiaj timer od nowa
      startTaxCollection();
    }, delay);
  }

  // Inicjalizuj ostatni pobór podatków i uruchom timer
  client.lastTaxCollection = getLastTaxTime();
  client.getMsUntilNextTaxTime = getMsUntilNextTaxTime;
  startTaxCollection();

  // Zakończ wszystkie trwające gry i zwróć stawki przed poborem podatków
  async function endAllActiveGamesAndRefund() {
    const refunds = [];
    const threadsToNotify = new Set();

    const { withData, createUser } = require('./utils/storage');
    const { formatCurrency } = require('./utils/economy');

    // Blackjack
    if (client.activeBlackjackGames) {
      for (const [userId, game] of client.activeBlackjackGames.entries()) {
        const bet = Number(game.bet || 0);
        if (bet > 0) {
          await withData(store => {
            const user = createUser(userId, store.users);
            user.balance += bet;
          });
          refunds.push({ userId, amount: bet, game: 'blackjack', threadId: game.threadId });
          if (game.threadId) {
            threadsToNotify.add(game.threadId);
          }
        }
      }
      client.activeBlackjackGames.clear();
    }

    // Chicken Road
    if (client.activeChickenRoadGames) {
      for (const [userId, game] of client.activeChickenRoadGames.entries()) {
        const bet = Number(game.bet || 0);
        if (bet > 0) {
          await withData(store => {
            const user = createUser(userId, store.users);
            user.balance += bet;
          });
          refunds.push({ userId, amount: bet, game: 'chickenroad', threadId: game.threadId });
          if (game.threadId) {
            threadsToNotify.add(game.threadId);
          }
        }
      }
      client.activeChickenRoadGames.clear();
    }

    // Gielda
    if (client.stockSessions) {
      for (const [threadId, session] of client.stockSessions.entries()) {
        threadsToNotify.add(threadId);
        for (const [userId, inv] of session.investments.entries()) {
          const amount = Number(inv.amount || 0);
          if (amount > 0) {
            await withData(store => {
              const user = createUser(userId, store.users);
              user.balance += amount;
            });
            refunds.push({ userId, amount, game: 'gielda', threadId });
          }
        }
      }
      client.stockSessions.clear();
      client.activeGieldaHosts?.clear?.();
    }

    // Wojna
    if (client.warSessions) {
      for (const [threadId, session] of client.warSessions.entries()) {
        threadsToNotify.add(threadId);
        const bet = Number(session.bet || 0);
        if (bet > 0 && Array.isArray(session.participants)) {
          for (const participantId of session.participants) {
            await withData(store => {
              const user = createUser(participantId, store.users);
              user.balance += bet;
            });
            refunds.push({ userId: participantId, amount: bet, game: 'wojna', threadId });
          }
        }
      }
      client.warSessions.clear();
    }

    // Mecz
    if (client.meczInProgress) {
      for (const userId of client.meczInProgress) {
        const bet = Number(client.meczBets?.get?.(userId) || 0);
        if (bet > 0) {
          let userThreadId = null;
          await withData(store => {
            const user = createUser(userId, store.users);
            user.balance += bet;
            userThreadId = user.lastActiveThreadId;
          });
          refunds.push({ userId, amount: bet, game: 'mecz', threadId: userThreadId });
          if (userThreadId) {
            threadsToNotify.add(userThreadId);
          }
        }
      }
      client.meczInProgress.clear();
    }
    if (client.activeMeczTimers) {
      for (const [userId, timers] of client.activeMeczTimers.entries()) {
        for (const timer of timers) {
          clearTimeout(timer);
        }
      }
      client.activeMeczTimers.clear();
    }
    if (client.activeMatches) {
      client.activeMatches.clear();
    }

    // Multimecz
    if (client.activeMultiMatches) {
      for (const [userId, multi] of client.activeMultiMatches.entries()) {
        const bet = Number(client.meczBets?.get?.(userId) || 0);
        if (bet > 0) {
          let userThreadId = null;
          await withData(store => {
            const user = createUser(userId, store.users);
            user.balance += bet;
            userThreadId = user.lastActiveThreadId;
          });
          refunds.push({ userId, amount: bet, game: 'multimecz', threadId: userThreadId });
          if (userThreadId) {
            threadsToNotify.add(userThreadId);
          }
        }
      }
      client.activeMultiMatches.clear();
    }

    if (client.meczBets) {
      client.meczBets.clear();
    }

    // Multiruletka
    if (client.activeMultiRoulettes) {
      for (const [threadId, game] of client.activeMultiRoulettes.entries()) {
        threadsToNotify.add(threadId);
        if (Array.isArray(game.bets)) {
          for (const bet of game.bets) {
            const amount = Number(bet.betAmount || 0);
            if (amount > 0) {
              await withData(store => {
                const user = createUser(bet.userId, store.users);
                user.balance += amount;
              });
              refunds.push({ userId: bet.userId, amount, game: 'multiruletka', threadId });
            }
          }
        }
      }
      client.activeMultiRoulettes.clear();
    }

    // Rosyjska ruletka challenges (no money deducted, just delete)
    client.rrRequests?.clear?.();

    // PKN challenges (no money deducted, just delete)
    client.pknRequests?.clear?.();

    // Duel challenges (no money deducted, just delete)
    client.duelRequests?.clear?.();

    // Milionerzy
    if (client.activeMilionerzy) {
      for (const [threadId, game] of client.activeMilionerzy.entries()) {
        threadsToNotify.add(threadId);
        const prize = Number(game.prize || 0);
        if (prize > 0 && game.hostId) {
          await withData(store => {
            const user = createUser(game.hostId, store.users);
            user.balance += prize;
          });
          refunds.push({ userId: game.hostId, amount: prize, game: 'milionerzy', threadId });
        }
      }
      client.activeMilionerzy.clear();
    }

    // Save state
    try { saveGameSessions(client); } catch (e) {}

    // Send notifications to chats about refunded bets
    if (threadsToNotify.size > 0 && client.api) {
      for (const threadId of threadsToNotify) {
        const threadRefunds = refunds.filter(r => r.threadId === threadId || (!r.threadId && client.lastThreadId === threadId));
        if (threadRefunds.length > 0) {
          let msg = `⚠️ **PRZERWANO GRY (ZBLIŻAJĄCY SIĘ PODATEK)** ⚠️\n` +
                    `Rozgrywki w tym wątku zostały anulowane z powodu zbliżającego się poboru podatków. Zwrócono stawki:\n`;
          for (const refund of threadRefunds) {
            const userName = (client.userNames && client.userNames.get(refund.userId)) || `Gracz_${refund.userId.slice(-6)}`;
            msg += `• @${userName} — **${formatCurrency(refund.amount)}** (gra: ${refund.game})\n`;
          }
          client.api.sendMessage(msg, threadId, (err) => {
            if (err) console.error('[TAX-WARNING] Błąd wysyłania powiadomienia o zwrocie:', err.message || err);
          })?.catch?.(err => {
            console.error('[TAX-WARNING] Błąd (Promise) powiadomienia o zwrocie:', err.message || err);
          });
        }
      }
    }

    console.log(`[TAX-WARNING] Zakończono gry. Zwrócono ${refunds.length} stawek.`);
    return refunds;
  }

  // System progresywnego podatku majątkowego co 6 godzin
  function startProgressiveTaxCollection() {
    const delay = getMsUntilNextProgressiveTax();

    const warningDelay = Math.max(0, delay - 15000);
    setTimeout(async () => {
      client.taxWarningActive = true;
      console.log('[PROGRESSIVE-TAX] Ostrzeżenie: podatek majątkowy zostanie pobrany za 15 sekund. Zamykanie aktywnych gier i zwrot stawek...');
      await endAllActiveGamesAndRefund();
    }, warningDelay);

    setTimeout(async () => {
      try {
        client.taxWarningActive = false;
        await endAllActiveGamesAndRefund();

        const result = await withData(store => {
          const profiles = store.profiles || {};
          const nextAt = Number(profiles.nextTaxCollectionAt || 0);
          if (Date.now() < nextAt) {
            return { collected: [], totalCollected: 0 };
          }

          const collected = [];
          let totalCollected = 0;

          for (const [userId, user] of Object.entries(store.users || {})) {
            const balance = Number(user.balance || 0);
            const bank = Number(user.bank || 0);
            const wealth = balance + bank;

            if (wealth <= 0) continue;

            const userInv = store.inventory[userId] || {};
            const hasKsiegowa = (userInv['dobra_ksiegowa'] || 0) > 0;
            const { tax, topLabel } = calculateProgressiveTax(wealth, hasKsiegowa);
            if (tax <= 0) continue;

            const udzialBalance = balance / wealth;
            const zBalance = Math.round(tax * udzialBalance);
            const zBank = tax - zBalance;

            user.balance = Math.max(0, balance - zBalance);
            user.bank = Math.max(0, bank - zBank);

            totalCollected += tax;
            collected.push({
              userId,
              name: user.name || `Użytkownik_${String(userId).slice(-6)}`,
              taxPaid: tax,
              wealthBefore: wealth,
              bracketLabel: topLabel,
              threadId: user.lastActiveThreadId || null
            });
          }

          profiles.nextTaxCollectionAt = Date.now() + 6 * 60 * 60 * 1000;
          return { collected, totalCollected };
        });

        if (result.totalCollected > 0 && client.api) {
          const byThread = new Map();
          for (const entry of result.collected) {
            if (!entry.threadId) continue;
            if (!byThread.has(entry.threadId)) {
              byThread.set(entry.threadId, []);
            }
            byThread.get(entry.threadId).push(entry);
          }

           for (const [threadId, players] of byThread.entries()) {
             if (isNotificationBlocked(threadId)) continue;
             players.sort((a, b) => b.taxPaid - a.taxPaid);
            const shown = players.slice(0, 10);
            const rest = players.length > 10 ? ` ... i ${players.length - 10} innych` : '';

            const lines = shown.map((p, i) => {
              const prefix = i === 0 ? '├─' : '└─';
              return `${prefix} ${p.name}: -${p.taxPaid.toLocaleString()} v (próg: ${p.bracketLabel})`;
            }).join('\n');

             const groupSum = players.reduce((sum, p) => sum + p.taxPaid, 0);
             const msg =
               `💰 **POBRANO PODATEK MAJĄTKOWY** 💰\n\n` +
               `W tym cyklu zapłacili:\n${lines}${rest}\n\n` +
               `━━━━━━━━━━━━━━\n` +
               `📉 Łącznie pobrano z grupy: **${groupSum.toLocaleString()} v**\n` +
               `⏳ Następny pobór za: 6h\n\n` +
               `⚠️ Podatek jest progresywny i kumuluje się co 6h —\n` +
               `im dłużej trzymasz dużą gotówkę, tym bardziej się opłaca ją zainwestować (giełda, firma) albo wydać.\n\n` +
               `ℹ️ Aby wyłączyć powiadomienia wpisz !zakaz powiadomienia`;
             client.api.sendMessage(msg, threadId, (err) => {
               if (err) console.error('[PROGRESSIVE-TAX] Błąd wysyłania powiadomienia:', err.message || err);
             })?.catch?.(err => {
               console.error('[PROGRESSIVE-TAX] Błąd wysyłania powiadomienia (Promise):', err.message || err);
             });
           }
        }

        console.log(`[PROGRESSIVE-TAX] Pobór zakończony. Łącznie: ${result.totalCollected.toLocaleString()} v od ${result.collected.length} graczy.`);
      } catch (err) {
        console.error('[PROGRESSIVE-TAX] Błąd podczas poboru:', err);
      }

      startProgressiveTaxCollection();
    }, delay);
  }

  function startGangReputationDecay() {
    const delay = getMsUntilNextGangReputationDecay();
    setTimeout(async () => {
      try {
        const result = await withData(store => {
          const profiles = store.profiles || {};
          const nextAt = Number(profiles.nextGangReputationDecayAt || 0);
          if (Date.now() < nextAt) {
            return { decayed: 0 };
          }

          const gangs = profiles.gangs || {};
          let decayed = 0;
          const now = Date.now();
          for (const gang of Object.values(gangs)) {
            if (!gang.lastActivityAt || now - gang.lastActivityAt >= 7 * 24 * 60 * 60 * 1000) {
              gang.reputation = Math.max(0, (gang.reputation || 0) - 10);
              decayed++;
            }
          }
          profiles.nextGangReputationDecayAt = now + 7 * 24 * 60 * 60 * 1000;
          return { decayed };
        });

        if (result.decayed > 0) {
          console.log(`[GANG-REP] Zastosowano spadek reputacji dla ${result.decayed} nieaktywnych gangów.`);
        }
      } catch (err) {
        console.error('[GANG-REP] Błąd podczas sprawdzania spadku reputacji:', err);
      }

      startGangReputationDecay();
    }, delay);
  }

  withData(store => {
    if (!store.profiles.nextGangReputationDecayAt) {
      store.profiles.nextGangReputationDecayAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    }
  }).catch(() => {});

  startGangReputationDecay();

  function startTerritoryRotation() {
    const delay = getMsUntilNextTerritoryRotation();
    setTimeout(async () => {
      try {
        const result = await withData(store => {
          const profiles = store.profiles || {};
          const territories = profiles.territories || {};
          const nextAt = Number(territories.nextRotationAt || 0);
          if (Date.now() < nextAt) {
            return { rotated: 0 };
          }

          const definitions = (territoriesConfig && territoriesConfig.definitions) || [];
          const allIds = definitions.map(d => d.id);
          const shuffled = allIds.sort(() => Math.random() - 0.5);
          const newActive = shuffled.slice(0, 5);
          const owners = territories.owners || {};

          for (const id of allIds) {
            if (!owners[id]) {
              owners[id] = null;
            }
          }

          territories.activeIds = newActive;
          territories.owners = owners;
          territories.nextRotationAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
          return { rotated: newActive.length };
        });

        if (result.rotated > 0) {
          console.log(`[TERRITORIES] Rotacja terytoriów: aktywne ${result.rotated} obszarów.`);
        }
      } catch (err) {
        console.error('[TERRITORIES] Błąd podczas rotacji terytoriów:', err);
      }

      startTerritoryRotation();
    }, delay);
  }

  try {
    const profiles = loadData('profiles');
    const needsInit = !profiles.territories || !Array.isArray(profiles.territories.activeIds) || profiles.territories.activeIds.length === 0;
    if (needsInit) {
      const definitions = (config.territories && config.territories.definitions) || [];
      const allIds = definitions.map(d => d.id);
      const shuffled = allIds.sort(() => Math.random() - 0.5);
      const initialActive = shuffled.slice(0, 5);
      const owners = {};
      for (const id of allIds) {
        owners[id] = null;
      }
      profiles.territories = { activeIds: initialActive, owners, nextRotationAt: Date.now() + 7 * 24 * 60 * 60 * 1000 };
      saveData('profiles', profiles);
      console.log('[TERRITORIES] Inicjalizacja: ' + initialActive.length + ' aktywnych obszarow.');
    }
  } catch (err) {
    console.error('[TERRITORIES] Blad inicjalizacji:', err);
  }

  startTerritoryRotation();

  // Inicjalizuj pierwszy czas poboru progresywnego podatku jeśli nie istnieje
  withData(store => {
    if (!store.profiles.nextTaxCollectionAt) {
      store.profiles.nextTaxCollectionAt = Date.now() + 6 * 60 * 60 * 1000;
    }
  }).catch(() => {});

  startProgressiveTaxCollection();

  // System automatycznego resetu ekonomii co miesiąc o 00:00 czasu polskiego
  async function checkAndAnnounceMonthlyReset() {
    try {
      let resetTriggered = false;
      let winners = [];
      let gangWinners = [];

      await withData(store => {
        if (store.profiles.justReset) {
          resetTriggered = true;
          winners = store.profiles.lastResetWinners || [];
          gangWinners = store.profiles.lastGangSeasonWinners || [];
          store.profiles.justReset = false;
        }
      });

      if (resetTriggered && client.api) {
        console.log('[MONTHLY RESET] Detected justReset flag. Broadcasting announcement...');
        
        const date = new Date();
        let prevMonthIdx = date.getMonth() - 1;
        let prevMonthYear = date.getFullYear();
        if (prevMonthIdx < 0) {
          prevMonthIdx = 11;
          prevMonthYear -= 1;
        }

        const MONTH_NAMES_PL = [
          'STYCZEŃ', 'LUTY', 'MARZEC', 'KWIECIEŃ', 'MAJ', 'CZERWIEC',
          'LIPIEC', 'SIERPIEŃ', 'WRZESIEŃ', 'PAŹDZIERNIK', 'LISTOPAD', 'GRUDZIEŃ'
        ];
        const monthStr = MONTH_NAMES_PL[prevMonthIdx];
        const seasonNum = Math.max(1, (prevMonthYear - 2026) * 12 + prevMonthIdx - 2);

        const eventItems = {
          'krolewskie_insygnia': { emoji: '👑', name: 'Królewskie Insygnia' },
          'licencja_monopolisty': { emoji: '📜', name: 'Licencja Monopolisty' },
          'szwajcarski_zegarek': { emoji: '⌚', name: 'Szwajcarski Zegarek' },
          'ksiega_monopolisty': { emoji: '📖', name: 'Księga Monopolisty' },
          'katalizator_bogactwa': { emoji: '🧪', name: 'Katalizator Bogactwa' },
          'szkarlatne_oko': { emoji: '👁️', name: 'Szkarłatne Oko Krupiera' },
          'cien_nocy': { emoji: '🥷', name: 'Cień Nocy' },
          'wampirzy_sztylet': { emoji: '🩸', name: 'Wampirzy Sztylet' },
          'szwajcarski_klucz': { emoji: '🔑', name: 'Szwajcarski Klucz' },
          'krysztal_doswiadczenia': { emoji: '🔮', name: 'Kryształ Doświadczenia' },
          'ananas_na_pizzy': { emoji: '🍕', name: 'Ananas na Pizzy' },
          'czarna_bandera': { emoji: '🏴', name: 'Czarna Bandera' },
          'czarna_karta': { emoji: '💳', name: 'Czarna Karta Bankowa' },
          'kosci_oszusta': { emoji: '🎲', name: 'Kości Oszusta' },
          'czterolistna_moneta': { emoji: '🍀', name: 'Czterolistna Moneta' },
          'deweloper': { emoji: '🏗️', name: 'Deweloper' },
          'polityk': { emoji: '🎩', name: 'Polityk' },
          'eclipse': { emoji: '🌑', name: 'Eclipse' },
          'mark_of_sacrifice': { emoji: '🎭', name: 'Mark of Sacrifice' },
          'nether_blade': { emoji: '⚔️', name: 'Nether Blade' },
          'korona_hegemonii': { emoji: '👑', name: 'Korona Hegemonii' },
          'lepsze_ufortyfikowanie': { emoji: '🛡️', name: 'Lepsze ufortyfikowanie' },
          'kodeks_honoru': { emoji: '📜', name: 'Kodeks honoru' }
        };

        const rankEmojis = ['🥇', '🥈', '🥉', '🏅', '🏅'];
        let winnerLines = [];
        for (let i = 0; i < winners.length; i++) {
          const w = winners[i];
          const name = await client.resolveUserName(client.api, w.userId);
          const item = eventItems[w.item] || { emoji: '🎁', name: w.item };
          const rankEmoji = rankEmojis[i] || '🏅';
          winnerLines.push(`${rankEmoji} ${name} (Majątek: ${Number(w.total || 0).toLocaleString('en-US')} VicCoinów) — Otrzymuje: ${item.emoji} ${item.name} `);
        }

        const gangRankEmojis = ['🥇', '🥈', '🥉'];
        let gangWinnerLines = [];
        for (let i = 0; i < gangWinners.length; i++) {
          const gw = gangWinners[i];
          const rewardItem = eventItems[gw.reward] || { emoji: '🎁', name: gw.reward };
          const rankEmoji = gangRankEmojis[i] || '🏅';
          gangWinnerLines.push(`${rankEmoji} Gang **${gw.name}** (REP: ${Number(gw.reputation || 0).toLocaleString('en-US')}) — Otrzymuje: ${rewardItem.emoji} ${rewardItem.name}`);
        }

        let announceMsg = 
          `🌍 **[GLOBALNY RESET EKONOMII - ${monthStr} ${prevMonthYear}]** 🌍\n` +
          `Sezon ${seasonNum} został zakończony \n\n` +
          `ZWYCIĘZCY POPRZEDNIEGO SEZONU (TOP 5):\n\n` +
          (winnerLines.length > 0 ? winnerLines.join('\n') : 'Brak zwycięzców.') + `\n\n`;

        if (gangWinnerLines.length > 0) {
          announceMsg += `TOP 3 GANGI SEZONU:\n\n` + gangWinnerLines.join('\n') + `\n\n`;
        }

        announceMsg += `dziekujemy za granie w tym sezonie i życzymy powodzenia w nastepnym <3`;

        const recentTargets = await getRecentActiveThreads(client);
        const targets = recentTargets.length > 0 ? recentTargets : (client.lastThreadId ? [client.lastThreadId] : []);
        for (const tId of targets) {
          if (isNotificationBlocked(tId)) continue;
          client.api.sendMessage(announceMsg, tId);
        }
      }
    } catch (err) {
      console.error('[MONTHLY RESET] Błąd podczas sprawdzania/ogłaszania resetu:', err);
    }
  }

  function startMonthlyResetTimer() {
    const delay = getMsUntilNextMonthlyReset() + 2000;
    const maxDelay = 24 * 60 * 60 * 1000; // 24h limit for setTimeout to prevent 32-bit signed int overflow
    if (delay > maxDelay) {
      setTimeout(() => {
        startMonthlyResetTimer();
      }, maxDelay);
    } else {
      setTimeout(async () => {
        try {
          console.log('[MONTHLY RESET] Timer fired. Checking/triggering reset...');
          await checkAndAnnounceMonthlyReset();
        } catch (err) {
          console.error('[MONTHLY RESET TIMER] Błąd podczas automatycznego resetu:', err);
        }
        startMonthlyResetTimer();
      }, delay);
    }
  }

  startMonthlyResetTimer();

  // Sprawdź czy nastąpił reset przy starcie bota (np. jeśli był wyłączony o północy)
  setTimeout(() => {
    checkAndAnnounceMonthlyReset().catch(err => {
      console.error('[MONTHLY RESET] Błąd przy sprawdzaniu resetu na starcie:', err);
    });
  }, 5000);

  // System przypomnień o pożyczkach co 12 godzin (zawsze o północy i w południe)
  function startLoanReminder() {
    const delay = getMsUntilNextTaxTime() + 2000;
    setTimeout(async () => {
      try {
        if (client.api) {
          const targets = Array.from(client.activeThreadIds);
          for (const threadId of targets) {
            try {
              const info = await getThreadInfoCachedAsync(client.api, threadId);
              if (!info || !info.participantIDs || info.participantIDs.length === 0) continue;
              
              const participants = info.participantIDs;
              const matchingUsers = [];
              
              await withData(store => {
                for (const pid of participants) {
                  const user = store.users[pid];
                  if (user && user.activeLoan) {
                    matchingUsers.push({
                      pid,
                      amount: user.activeLoan.amount,
                      takenAt: user.activeLoan.takenAt
                    });
                  }
                }
              });
              
              if (matchingUsers.length > 0) {
                const reminders = [];
                for (const mu of matchingUsers) {
                  const name = await client.resolveUserName(client.api, mu.pid);
                  const elapsed = Date.now() - mu.takenAt;
                  const remainingRepayMs = Math.max(0, 48 * 60 * 60 * 1000 - elapsed);
                  reminders.push({
                    pid: mu.pid,
                    name,
                    amount: mu.amount,
                    timeLeftStr: msToReadable(remainingRepayMs)
                  });
                }
                
                const lines = reminders.map(r => `👤 @${r.name} — Pozostało do spłaty: **${formatCurrency(r.amount)}** (Auto-spłata za: **${r.timeLeftStr}**)`).join('\n');
                const tagMentions = reminders.map(r => ({
                  tag: `@${r.name}`,
                  id: r.pid
                }));
                
                const remindMsg = {
                  body: `⚠️ **PRZYPOMNIENIE O POŻYCZCE** ⚠️\nNastępujące osoby mają aktywną pożyczkę do spłaty:\n\n${lines}\n\n👉 Spłać komendą: \`!pozyczka splac <kwota|all>\`\n\nℹ️ Aby wyłączyć powiadomienia wpisz !zakaz powiadomienia`,
                  mentions: tagMentions
                };
                
                if (!isNotificationBlocked(threadId)) {
                  client.api.sendMessage(remindMsg, threadId);
                }
              }
            } catch (err) {
              if (_threadApiBackoffUntil > Date.now()) {
                console.log('[LOAN-REMINDER] Backoff aktywny — przerywam sprawdzanie pożyczek.');
                break;
              }
            }
          }
        }
      } catch (err) {
        console.error('[LOAN-REMINDER] Błąd podczas wysyłania przypomnienia:', err);
      }
      
      startLoanReminder();
    }, delay);
  }
  
  startLoanReminder();

  // System Szybkich Palców (reakcja) co 9-24 godzin
  function startReactionTimer() {
    const minDelay = 9 * 60 * 60 * 1000;
    const maxDelay = 24 * 60 * 60 * 1000;
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    setTimeout(async () => {
      try {
        if (client.api && client.activeThreadIds.size > 0) {
          const targets = Array.from(client.activeThreadIds);
          
          if (!client.activeReactions) {
            client.activeReactions = new Map();
          }

          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

          for (const threadId of targets) {
            let code = '';
            for (let i = 0; i < 6; i++) {
              code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            const prize = Math.floor(Math.random() * (200000 - 20000 + 1)) + 20000;

            client.activeReactions.set(threadId, {
              code,
              prize,
              active: true,
              timestamp: Date.now()
            });

             const announceMsg = `⚡ **SZYBKIE PALCE** ⚡\nKto pierwszy przepisze poniższy kod, wygrywa **💰 ${prize.toLocaleString()}**!\n\n👉 **\`${code}\`**\n\nℹ️ Aby wyłączyć powiadomienia wpisz !zakaz powiadomienia`;
            
            if (!isNotificationBlocked(threadId)) {
              client.api.sendMessage(announceMsg, threadId);
            }

            // Auto-cleanup po 2 minutach
            setTimeout(() => {
              const game = client.activeReactions.get(threadId);
              if (game && game.code === code && game.active) {
                client.activeReactions.delete(threadId);
                if (!isNotificationBlocked(threadId)) {
                  client.api.sendMessage(`⌛ **SZYBKIE PALCE** ⌛\nCzas minął! Nikt nie przepisał kodu **\`${code}\`** na czas.`, threadId);
                }
              }
            }, 2 * 60 * 1000).unref();
          }
        }
      } catch (err) {
        console.error('[REACTION] Błąd podczas uruchamiania reakcji:', err);
      }

      startReactionTimer();
    }, delay);
  }

  // Uruchom timer reakcji
  startReactionTimer();

  // System Zgadnij Kraj (flagi) co 10-24 godzin
  function startFlagTimer() {
    const minDelay = 10 * 60 * 60 * 1000;
    const maxDelay = 24 * 60 * 60 * 1000;
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    setTimeout(async () => {
      try {
        if (client.api && client.activeThreadIds.size > 0) {
          const targets = Array.from(client.activeThreadIds);

          if (!client.activeFlags) {
            client.activeFlags = new Map();
          }

          const flagaCmd = require('./commands/flaga');
          const flagsList = Array.isArray(flagaCmd.flagsList) ? flagaCmd.flagsList : [];
          const { loadData } = require('./utils/storage');
          const profiles = loadData('profiles');

          for (const threadId of targets) {
            const threadSettings = (profiles.threadSettings || {})[threadId] || {};
            if (threadSettings.blockFlags) {
              continue;
            }

            if (!flagsList.length) {
              console.error('[FLAGA] flagsList jest pusta lub brakuje exportu.');
              continue;
            }
            const randomFlag = flagsList[Math.floor(Math.random() * flagsList.length)];
            const { time, prize } = flagaCmd.getGameSettings(randomFlag.region);

            client.activeFlags.set(threadId, {
              emoji: randomFlag.emoji,
              answers: randomFlag.answers,
              countryName: randomFlag.name,
              prize,
              active: true,
              timestamp: Date.now()
            });

             const announceMsg = `🏳️ **ZGADNIJ KRAJ** 🏳️\nJaki kraj reprezentuje ta flaga?\n\n👉 **${randomFlag.emoji}**\n\n💰 Nagroda: **💰 ${prize.toLocaleString()}**!\n⏱️ Masz ${time} sekund na odpowiedź.\n\nℹ️ Aby wyłączyć powiadomienia wpisz !zakaz powiadomienia`;
            if (!isNotificationBlocked(threadId)) {
              client.api.sendMessage(announceMsg, threadId);
            }

            // Auto-cleanup po określonym czasie
            setTimeout(() => {
              const game = client.activeFlags.get(threadId);
              if (game && game.emoji === randomFlag.emoji && game.active) {
                client.activeFlags.delete(threadId);
                if (!isNotificationBlocked(threadId)) {
                  client.api.sendMessage(`⌛ **ZGADNIJ KRAJ** ⌛\nCzas minął! Nikt nie zgadł flagi **${randomFlag.emoji}** (${randomFlag.name}) na czas.`, threadId);
                }
              }
            }, time * 1000).unref();
          }
        }
      } catch (err) {
        console.error('[FLAGS] Błąd podczas uruchamiania zgadywanki flag:', err);
      }

      startFlagTimer();
    }, delay);
  }

  // Uruchom timer flag
  startFlagTimer();

  client.processedNewGroups = client.processedNewGroups || new Set();

  async function handleNewGroupAdded(threadId, groupName, adderName = 'Nieznany', memberCount = 0, adderId = null) {
    if (client.processedNewGroups.has(threadId)) {
      return;
    }
    client.processedNewGroups.add(threadId);
    try {
      fs.writeFileSync(processedGroupsPath, JSON.stringify(Array.from(client.processedNewGroups), null, 2), 'utf8');
    } catch (err) {
      console.error('[SELF-BOT] Failed to save processed new groups:', err);
    }

    console.log(`[NEW GROUP] Wykryto dodanie do nowej grupy: ${groupName} (ID: ${threadId}, dodany przez: ${adderName} (${adderId || 'Nieznany'}), osób: ${memberCount}). Wysyłanie powitania i powiadomienia...`);

    // 1. Wyślij wiadomość powitalną do nowej grupy (akceptacja zaproszenia/żądania wiadomości)
    const welcomeMsg = "dziekuje za dodanie na grupe, moj prefix to ! po wiecej informacji wpisz !help\nrówniez polecam zobaczyc !zasady\nsprawdz tez !poradnik na start!, jesli ma ktos sprawe do tworcy bota to link do jego konta jest w !zasady";
    api.sendMessage(welcomeMsg, threadId, (sendErr) => {
      if (sendErr) {
        console.error(`[NEW GROUP ERROR] Błąd podczas wysyłania powitania do grupy ${threadId}:`, sendErr);
      } else {
        console.log(`[NEW GROUP] Pomyślnie wysłano powitanie do nowej grupy ${threadId}.`);
      }
    });



    // Zwiększ i pobierz licznik dodanych grup przez daną osobę
    let addedGroupsCount = 0;
    if (adderId && adderId !== 'Nieznany') {
      try {
        addedGroupsCount = await withData(store => {
          if (!store.profiles) store.profiles = {};
          if (!store.profiles.addedGroupsCount) store.profiles.addedGroupsCount = {};
          const currentCount = (store.profiles.addedGroupsCount[adderId] || 0) + 1;
          store.profiles.addedGroupsCount[adderId] = currentCount;
          return currentCount;
        });
      } catch (err) {
        console.error('[SELF-BOT] Failed to increment added groups count:', err);
      }
    }

    // 2. Wyślij powiadomienie na grupę o ID 24956371943963938
    const notifyGroupId = '24956371943963938';
    let notifyMsg = `🔔 **BOT ZOSTAŁ DODANY DO NOWEJ GRUPY** 🔔\n` +
                      `👥 Nazwa: **${groupName}**\n` +
                      `🆔 ID: \`${threadId}\`\n` +
                      `👤 Dodał: **${adderName} (${adderId || 'Nieznany'})**\n` +
                      `👥 Liczba osób: **${memberCount}**`;

    if (addedGroupsCount > 0) {
      notifyMsg += `\n\n👤 Ta osoba dodała bota do **${addedGroupsCount}** grup`;
    }

    api.sendMessage(notifyMsg, notifyGroupId, (notifyErr) => {
      if (notifyErr) {
        console.error(`[NEW GROUP NOTIFY ERROR] Błąd podczas wysyłania powiadomienia na grupę powiadomień ${notifyGroupId}:`, notifyErr);
      } else {
        console.log(`[NEW GROUP] Pomyślnie wysłano powiadomienie do grupy powiadomień ${notifyGroupId}.`);
      }
    });
  }


  api.setOptions({
    listenEvents: true,
    selfListen: true,
    autoMarkRead: false
  });

  const mqttClient = api.listenMqtt();
  mqttClient.on('message', async (event) => {
    if (!event || !event.type) {
      return;
    }

    const senderId = String(event.senderID || '');
    const threadId = String(event.threadID || event.senderID || '');
    const isGroup = threadId && threadId !== senderId;

    if (!isGroup && ['message', 'message_reply'].includes(event.type)) {
      console.log(`[PV-DEBUG] Odebrano wiadomosc PV od ${senderId}: "${event.body}" | typ=${event.type}`);
    }

    // Interceptor dla zmiany pseudonimu (log:thread-nickname lub log:user-nickname)
    const isNicknameEvent = (event.type === 'event' && (event.logMessageType === 'log:thread-nickname' || event.logMessageType === 'log:user-nickname')) 
                         || (event.type === 'log:thread-nickname' || event.type === 'log:user-nickname')
                         || (event.logMessageType === 'log:thread-nickname' || event.logMessageType === 'log:user-nickname');
    if (isNicknameEvent) {
      // 1. Unconditional self-ignore: Ignoruj WSZYSTKIE zmiany wykonane przez samego bota, aby zapobiec pętlom i blokadom Facebooka
      const botId = typeof api.getCurrentUserID === 'function' ? api.getCurrentUserID() : '';
      const authorId = event.author || event.senderID || event.participantID;
      if (botId && authorId && String(authorId) === String(botId)) {
        return;
      }

      const threadId = event.threadID;
      const targetId = event.logMessageData?.participant_id 
                    || event.logMessageData?.participantID 
                    || event.logMessageData?.participantId 
                    || event.logMessageData?.target_id 
                    || event.logMessageData?.targetID 
                    || event.logMessageData?.targetId
                    || event.participantID
                    || event.targetID;

      // Unikaj równoległego przywracania pseudonimu dla tego samego użytkownika
      client.pendingGuardRestores = client.pendingGuardRestores || new Map();
      const restoreKey = `${threadId}_${targetId}`;
      if (threadId && targetId && client.pendingGuardRestores.has(restoreKey)) {
        return;
      }
      
      let newNickname = undefined;
      if (event.logMessageData?.nickname !== undefined && event.logMessageData?.nickname !== null) {
        newNickname = event.logMessageData.nickname;
      } else if (event.logMessageData?.newNickname !== undefined && event.logMessageData?.newNickname !== null) {
        newNickname = event.logMessageData.newNickname;
      } else if (event.logMessageData?.value !== undefined && event.logMessageData?.value !== null) {
        newNickname = event.logMessageData.value;
      } else if (event.nickname !== undefined && event.nickname !== null) {
        newNickname = event.nickname;
      }

      if (threadId && targetId) {
        let guardNickname = null;
        await withData(store => {
          if (store.profiles.threadSettings && store.profiles.threadSettings[threadId]) {
            const settings = store.profiles.threadSettings[threadId];
            if (settings.nicknameGuards && settings.nicknameGuards[targetId]) {
              guardNickname = settings.nicknameGuards[targetId];
            } else if (settings.nicknameGuard && String(settings.nicknameGuard.userId) === String(targetId)) {
              guardNickname = settings.nicknameGuard.nickname;
            }
          }
        });

        if (guardNickname && newNickname !== guardNickname) {
          console.log(`[GUARDNICK] Wykryto zmianę pseudonimu użytkownika ${targetId} na "${newNickname || '<brak>'}" w wątku ${threadId}. Przywracanie do "${guardNickname}" za 1.5s...`);
          
          client.pendingGuardRestores.set(restoreKey, true);
          setTimeout(() => {
            api.changeNickname(guardNickname, threadId, targetId, (err) => {
              client.pendingGuardRestores.delete(restoreKey);
              if (err) {
                console.error('[SELF-BOT GUARDNICK ERROR]', err);
              } else {
                console.log(`[GUARDNICK] Pomyślnie przywrócono pseudonim "${guardNickname}" dla ${targetId}.`);
              }
            });
          }, 1500).unref();
        }
      }
      return;
    }

    // Interceptor dla wyjścia z grupy (log:unsubscribe) - loop
    const isUnsubscribeEvent = (event.type === 'event' && event.logMessageType === 'log:unsubscribe') 
      || event.type === 'log:unsubscribe'
      || event.logMessageType === 'log:unsubscribe'
      || event.type === 'unsubscribe'
      || event.logMessageType === 'unsubscribe';

    if (isUnsubscribeEvent) {
      const threadId = event.threadID;
      
      // Wyciągamy ID usuniętych/wychodzących użytkowników
      const removedUsers = [];
      
      // 1. Jeśli użytkownik wyszedł dobrowolnie (leftParticipantFbId)
      if (event.logMessageData?.leftParticipantFbId) {
        removedUsers.push(String(event.logMessageData.leftParticipantFbId));
      }
      if (event.logMessageData?.left_participant_fb_id) {
        removedUsers.push(String(event.logMessageData.left_participant_fb_id));
      }
      if (event.logMessageData?.userFbId) {
        removedUsers.push(String(event.logMessageData.userFbId));
      }
      
      // 2. Jeśli użytkownik został usunięty/wyrzucony (removedParticipants)
      const dataParticipants = event.logMessageData?.removedParticipants || event.logMessageData?.removed_participants;
      if (Array.isArray(dataParticipants)) {
        for (const p of dataParticipants) {
          if (p && typeof p === 'object') {
            const uid = p.userFbId || p.userID || p.id || p.participantID;
            if (uid) removedUsers.push(String(uid));
          } else if (p) {
            removedUsers.push(String(p));
          }
        }
      }
      
      // 3. Fallbacki dla innych wersji FCA/Messenger
      if (event.participantID) {
        removedUsers.push(String(event.participantID));
      }
      if (event.targetID) {
        removedUsers.push(String(event.targetID));
      }
      if (event.logMessageData?.targetID || event.logMessageData?.target_id) {
        removedUsers.push(String(event.logMessageData.targetID || event.logMessageData.target_id));
      }

      // 4. Jeśli brak powyższych i author/senderID sam wywołał wyjście
      if (removedUsers.length === 0 && (event.author || event.senderID)) {
        removedUsers.push(String(event.author || event.senderID));
      }

      const uniqueRemoved = [...new Set(removedUsers.map(u => String(u).trim()).filter(Boolean))];

      // Ochrona twórcy bota przed wyrzuceniem
      const creatorId = '100060812419294';
      
      // Wykrywanie ID sprawcy (kickera) z uwzględnieniem różnych wariantów FCA
      let authorId = '';
      if (event.author) {
        authorId = String(event.author);
      } else if (event.senderID) {
        authorId = String(event.senderID);
      }
      if (!authorId && event.logMessageData) {
        if (event.logMessageData.actorFbId) {
          authorId = String(event.logMessageData.actorFbId);
        } else if (Array.isArray(event.logMessageData.removedParticipants) && event.logMessageData.removedParticipants[0]) {
          const firstPart = event.logMessageData.removedParticipants[0];
          if (firstPart && typeof firstPart === 'object') {
            authorId = String(firstPart.actorFbId || firstPart.actorID || '');
          }
        }
      }
      authorId = authorId.trim();
      
      if (threadId && uniqueRemoved.includes(creatorId) && authorId !== creatorId) {
        (async () => {
          try {
            const threadInfo = await getThreadInfoCachedAsync(api, threadId);
            const adminIDs = (threadInfo.adminIDs || []).map(admin => {
              if (typeof admin === 'object' && admin !== null) {
                return String(admin.id || admin.userID || '').trim();
              }
              return String(admin).trim();
            }).filter(Boolean);

            const botId = String(typeof api.getCurrentUserID === 'function' ? api.getCurrentUserID() : '').trim();
            const isBotAdmin = adminIDs.includes(botId);

            if (isBotAdmin) {
              // 1. Usuń osobę, która wyrzuciła twórcę
              if (authorId && authorId !== botId && authorId !== creatorId) {
                await new Promise((resolve) => {
                  api.removeUserFromGroup(authorId, threadId, () => resolve());
                });
              }

              // 2. Zabierz wszystkim innym admina (oprócz bota i twórcy)
              for (const adminId of adminIDs) {
                if (adminId !== botId && adminId !== creatorId && adminId !== authorId) {
                  await new Promise((resolve) => {
                    api.changeAdminStatus(threadId, adminId, false, () => resolve());
                  });
                }
              }

              // 3. Dodaj twórcę bota z powrotem do grupy
              await new Promise((resolve) => {
                api.addUserToGroup(creatorId, threadId, () => resolve());
              });

              // Krótkie opóźnienie przed nadaniem admina
              await new Promise(r => setTimeout(r, 1500));

              // 4. Daj twórcy admina
              await new Promise((resolve) => {
                api.changeAdminStatus(threadId, creatorId, true, () => resolve());
              });
            }
          } catch (e) {
            console.error('[CREATOR PROTECTION ERROR]', e);
          }
        })();
      }

      if (threadId && uniqueRemoved.length > 0) {
        let loopUsers = [];
        let loopAll = false;
        await withData(store => {
          if (store.profiles.threadSettings && store.profiles.threadSettings[threadId]) {
            if (store.profiles.threadSettings[threadId].loopUsers) {
              loopUsers = [...store.profiles.threadSettings[threadId].loopUsers].map(u => String(u).trim());
            }
            if (store.profiles.threadSettings[threadId].loopAll) {
              loopAll = true;
            }
          }
        });

        if (loopAll || loopUsers.length > 0) {
          for (const userId of uniqueRemoved) {
            const cleanUserId = String(userId).trim();
            const shouldLoop = loopAll || loopUsers.includes(cleanUserId);
            if (shouldLoop) {
              console.log(`[LOOP] Wykryto wyjście/wyrzucenie zapętlonego użytkownika ${cleanUserId} z wątku ${threadId}. Rozpoczynanie ponownego dodawania...`);

              const attemptAddUser = (attemptsLeft = 3, delayMs = 800) => {
                setTimeout(() => {
                  api.addUserToGroup(cleanUserId, threadId, (err) => {
                    if (!err) {
                      console.log(`[LOOP] Pomyślnie dodano użytkownika ${cleanUserId} z powrotem do grupy ${threadId}.`);
                      api.sendMessage(`🔁 **Zapętlony użytkownik został dodany z powrotem do grupy.**`, threadId);

                      // Sprawdź, czy użytkownik ma zablokowany pseudonim (guardnick) i go przywróć
                      (async () => {
                        let guardNickname = null;
                        await withData(store => {
                          if (store.profiles.threadSettings && store.profiles.threadSettings[threadId]) {
                            const settings = store.profiles.threadSettings[threadId];
                            if (settings.nicknameGuards && settings.nicknameGuards[cleanUserId]) {
                              guardNickname = settings.nicknameGuards[cleanUserId];
                            } else if (settings.nicknameGuard && String(settings.nicknameGuard.userId) === String(cleanUserId)) {
                              guardNickname = settings.nicknameGuard.nickname;
                            }
                          }
                        });

                        if (guardNickname) {
                          console.log(`[LOOP] Przywracanie zablokowanego pseudonimu "${guardNickname}" po powrocie dla ${cleanUserId}...`);
                          setTimeout(() => {
                            api.changeNickname(guardNickname, threadId, cleanUserId, (nickErr) => {
                              if (nickErr) {
                                console.error('[LOOP NICKNAME RESTORE ERROR]', nickErr);
                              } else {
                                console.log(`[LOOP] Pomyślnie przywrócono zablokowany pseudonim "${guardNickname}" dla ${cleanUserId}.`);
                              }
                            });
                          }, 1500).unref();
                        }
                      })();
                    } else {
                      console.error(`[LOOP ERROR] Błąd podczas dodawania użytkownika ${cleanUserId} (pozostało prób: ${attemptsLeft - 1}):`, err);
                      if (attemptsLeft > 1) {
                        const nextDelay = (4 - attemptsLeft + 1) * 2000;
                        console.log(`[LOOP] Ponawianie dodawania użytkownika ${cleanUserId} do grupy ${threadId} za ${nextDelay}ms...`);
                        attemptAddUser(attemptsLeft - 1, nextDelay);
                      }
                    }
                  });
                }, delayMs);
              };

              attemptAddUser(3, 800);
            }
          }
        }
      }
      return;
    }

    // Interceptor dla dodania do grupy (log:subscribe)
    const isSubscribeEvent = (event.type === 'event' && event.logMessageType === 'log:subscribe') || (event.type === 'log:subscribe');
    if (isSubscribeEvent) {
      const threadId = event.threadID;
      const botId = typeof api.getCurrentUserID === 'function' ? api.getCurrentUserID() : '';
      const addedParticipants = event.logMessageData?.addedParticipants || [];
      const isBotAdded = addedParticipants.some(p => p && String(p.userFbId || p.userID || p.id) === String(botId));

      if (isBotAdded && threadId) {
        getThreadInfoCached(api, threadId, (infoErr, info) => {
          const groupName = (!infoErr && info) ? (info.threadName || info.name || 'Grupa bez nazwy') : 'Nowa Grupa';
          const memberCount = (!infoErr && info && info.participantIDs) ? info.participantIDs.length : 0;
          const adderId = event.author;

          if (adderId) {
            api.getUserInfo(adderId, (userErr, userRes) => {
              const adderName = (!userErr && userRes && userRes[adderId]) ? userRes[adderId].name : `Użytkownik (${adderId})`;
              handleNewGroupAdded(threadId, groupName, adderName, memberCount, adderId);
            });
          } else {
            handleNewGroupAdded(threadId, groupName, 'Nieznany (Brak ID autora)', memberCount, null);
          }
        });
      }
      return;
    }

    function cleanupCachedEntry(entry) {
      if (entry && entry.attachments && entry.attachments.length > 0) {
        for (const filePath of entry.attachments) {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (err) {
            console.error('[CLEANUP] Failed to delete temp attachment file:', err);
          }
        }
      }
    }

    // Interceptor dla usunięcia wiadomości (message_unsend)
    if (event.type === 'message_unsend') {
      client.messageCache = client.messageCache || new Map();
      const cached = client.messageCache.get(event.messageID);
      if (cached) {
        // Nie wysyłaj powiadomienia, jeśli autorem usuniętej wiadomości jest twórca (100060812419294)
        if (cached.senderID === '100060812419294') {
          cleanupCachedEntry(cached);
          return;
        }

        // Sprawdź ustawienia grupy w bazie danych
        const isLoggingEnabled = await withData(store => {
          const settings = store.profiles.threadSettings && store.profiles.threadSettings[event.threadID];
          return settings ? settings.unsendLoggingEnabled !== false : true; // domyślnie włączone
        });

        if (isLoggingEnabled) {
          try {
            const senderName = await client.resolveUserName(api, cached.senderID);
            
            // Apply censorship to text only, not media
            let censoredBody = cached.body || '';
            const hasMedia = cached.attachmentUrls && cached.attachmentUrls.length > 0;
            
            // Only censor if there's text content
            if (censoredBody && !censoredBody.startsWith('[Załącznik:')) {
              censoredBody = await intelligentCensor(censoredBody, 'przywrócona wiadomość');
            }
            
            let announceMsg = `🗑️ **Użytkownik ${senderName} usunął wiadomość:**\n"${censoredBody}"`;
            
            if (hasMedia) {
              announceMsg += `\n\n🔗 **Linki do usuniętych załączników:**\n` + 
                             cached.attachmentUrls.map((url, idx) => `${idx + 1}. \`${url}\``).join('\n');
            }
            
            api.sendMessage(announceMsg, event.threadID, () => {
              cleanupCachedEntry(cached);
            });
          } catch (e) {
            console.error('[SELF-BOT] Blad podczas obslugi message_unsend:', e);
            cleanupCachedEntry(cached);
          }
        } else {
          cleanupCachedEntry(cached);
        }
      }
      return;
    }

    // Zapisz wiadomość w pamięci podręcznej przed filtracją body (do obsługi usuwania)
    if (['message', 'message_reply'].includes(event.type)) {
      client.messageCache = client.messageCache || new Map();
      let cacheBody = event.body || '';
      if (!cacheBody && event.attachments && event.attachments.length > 0) {
        cacheBody = `[Załącznik: ${event.attachments.map(a => a.type || 'plik').join(', ')}]`;
      }
      
      const cacheEntry = {
        body: cacheBody,
        senderID: event.senderID,
        timestamp: Date.now(),
        attachments: [],
        attachmentUrls: []
      };

      if (event.attachments && event.attachments.length > 0) {
        for (const att of event.attachments) {
          const url = att.url || att.largePreviewUrl || att.previewUrl;
          if (url) {
            cacheEntry.attachmentUrls.push(url);
          }
        }
      }

      if (cacheBody || cacheEntry.attachmentUrls.length > 0) {
        client.messageCache.set(event.messageID, cacheEntry);
        // Ogranicz rozmiar pamięci podręcznej do 2000 wpisów
        if (client.messageCache.size > 2000) {
          const firstKey = client.messageCache.keys().next().value;
          const firstEntry = client.messageCache.get(firstKey);
          cleanupCachedEntry(firstEntry);
          client.messageCache.delete(firstKey);
        }
      }

      // Logowanie całej konwersacji (historia wiadomości)
      try {
        const logs = loadData('logs');
        const replyTo = event.messageReply ? String(event.messageReply.senderID) : null;
        appendLog(logs, {
          type: 'message',
          userId: senderId,
          userName: client.userNames.get(senderId) || null,
          body: cacheBody,
          threadId,
          replyTo
        });
        saveData('logs', logs);
      } catch (err) {
        console.error('[STORAGE] Błąd podczas logowania wiadomości:', err);
      }

      // Zapisz do bufora ostatnich wiadomości (dla komendy !zapisz)
      try {
        if (!client.recentMessages) client.recentMessages = [];
        client.recentMessages.push({
          ts: Date.now(),
          type: event.type,
          senderID: senderId,
          body: cacheBody,
          threadId,
          isBot: String(senderId) === String(api.getCurrentUserID?.() || '')
        });
        if (client.recentMessages.length > 60000) {
          client.recentMessages = client.recentMessages.slice(-60000);
        }
      } catch (_) {}
    }

    if (!['message', 'message_reply'].includes(event.type) || !event.body) {
      return;
    }

    console.log(`[MQTT-MSG] Message received in thread ${threadId} from sender ${senderId}: "${event.body}"`);

    const text = event.body.trim();
    const messageId = event.messageID;

    if (senderId && client.api) {
      autoCollectPayout(senderId, client.api, threadId).catch(err => console.error('[AUTO-COLLECT] Error:', err));
    }

    let currentPrefix = client.config.prefix;
    if (isGroup && threadId) {
      await withData(store => {
        if (store.profiles.threadSettings && store.profiles.threadSettings[threadId] && store.profiles.threadSettings[threadId].prefix) {
          currentPrefix = store.profiles.threadSettings[threadId].prefix;
        }
      });
    } else if (!isGroup && senderId) {
      await withData(store => {
        if (!store.profiles.pvSettings) store.profiles.pvSettings = {};
        if (!store.profiles.pvSettings[senderId]) {
          store.profiles.pvSettings[senderId] = {
            prefix: client.config.prefix,
            createdAt: Date.now(),
            messageCount: 0,
            commandCount: 0
          };
        }
        if (store.profiles.pvSettings[senderId].prefix) {
          currentPrefix = store.profiles.pvSettings[senderId].prefix;
        }
      });
      if (!client.pvPrefixes) client.pvPrefixes = new Map();
      if (!client.pvPrefixes.has(senderId)) {
        client.pvPrefixes.set(senderId, {
          prefix: currentPrefix,
          firstUse: Date.now(),
          lastUse: Date.now(),
          messageCount: 0,
          commandCount: 0
        });
      }
      const pvData = client.pvPrefixes.get(senderId);
      pvData.lastUse = Date.now();
      pvData.messageCount++;
    }

    // --- SYSTEM AFK ---
    let wasAfk = false;
    let afkInfo = null;
    await withData(store => {
      if (store.profiles.afk && store.profiles.afk[senderId]) {
        afkInfo = store.profiles.afk[senderId];
        wasAfk = true;
      }
    });

    // Powiadomienie AFK przy oznaczeniu osoby
    if (event.mentions && Object.keys(event.mentions).length > 0) {
      const mentionedIds = Object.keys(event.mentions);
      const afkMessages = [];

      await withData(store => {
        if (store.profiles.afk) {
          for (const mId of mentionedIds) {
            if (store.profiles.afk[mId]) {
              const afkData = store.profiles.afk[mId];
              const elapsedMs = Date.now() - afkData.time;
              const elapsedStr = msToReadable(elapsedMs);
              afkMessages.push({ id: mId, reason: afkData.reason, elapsedStr });
            }
          }
        }
      });

      for (const afkUser of afkMessages) {
        const mName = await client.resolveUserName(api, afkUser.id);
        const replyMsg = `💤 **${mName}** jest obecnie AFK: **${afkUser.reason}** (od: ${afkUser.elapsedStr})`;
        api.sendMessage(replyMsg, threadId, () => {}, messageId);
      }
    }

    // Sam prefix - pokaz help
    if (text === currentPrefix) {
      api.sendMessage(`💡 Aby zobaczyć listę komend, proszę napisać: **${currentPrefix}help**`, threadId, (err) => {
        if (err) console.error('[SEND MSG ERROR]', err);
      }, messageId);
      return;
    }

    // Ignoruj wiadomości bota bez prefixu
    const botId = typeof api.getCurrentUserID === 'function' ? api.getCurrentUserID() : '';
    if (botId && String(senderId) === String(botId) && !text.startsWith(currentPrefix)) {
      console.log(`[MQTT-MSG] Ignored self-message without command prefix: "${text}"`);
      return;
    }

    // Mark as read
    if (threadId) {
      setTimeout(() => {
        try {
          api.markAsRead(threadId, (err) => {
            if (err) console.error('[SELF-BOT] Blad podczas oznaczania jako przeczytane:', err);
          });
        } catch (e) {
          console.error('[SELF-BOT] Blad api.markAsRead:', e);
        }
      }, 500 + Math.random() * 700);
    }

    client.lastThreadId = threadId;

    // Potwierdzenia (!afkdel ok/stop)
    if (client.pendingConfirmations) {
      const pendingKey = `${threadId}-${senderId}`;
      const pending = client.pendingConfirmations.get(pendingKey);
      if (pending) {
        const cleanText = text.toLowerCase().trim();
        if (cleanText === 'ok' || cleanText === 'stop') {
          clearTimeout(pending.timeout);
          client.pendingConfirmations.delete(pendingKey);

          if (cleanText === 'ok') {
            if (typeof pending.callback === 'function') {
              pending.callback().catch(err => {
                console.error('[CONFIRMATION CALLBACK ERROR]:', err);
              });
            }
          } else {
            api.sendMessage('✅ Pomyślnie przerwano.', threadId, () => {}, messageId);
          }
          return;
        }
      }
    }

    // ========================
    // ODDZIEL PV OD GRUP
    // ========================
    if (isGroup) {
      // ---------- GRUPA ----------
      const isCommand = text.startsWith(currentPrefix);
      if (!isCommand) {
        if (!client.lastNormalMessageTime) {
          client.lastNormalMessageTime = new Map();
        }
        const lastTime = client.lastNormalMessageTime.get(senderId) || 0;
        const now = Date.now();
        const shouldUpdateUser = (now - lastTime >= 2000);
        if (shouldUpdateUser) {
          client.lastNormalMessageTime.set(senderId, now);
        }

        await withData(store => {
          if (shouldUpdateUser) {
            const u = createUser(senderId, store.users);
            u.messageCount = (u.messageCount || 0) + 1;
            u.lastActiveTime = Date.now();
            u.groupMessages = u.groupMessages || {};
            u.groupMessages[threadId] = (u.groupMessages[threadId] || 0) + 1;
          }

          if (!store.groupStats) store.groupStats = {};
          if (!store.groupStats[threadId]) {
            store.groupStats[threadId] = {
              visibleMessages: 0,
              processedMessages: 0,
              commandsExecuted: 0,
              mentionsCount: 0,
              firstUse: Date.now(),
              lastUpdated: Date.now()
            };
          }
          const stats = store.groupStats[threadId];
          stats.seenMessageIds = stats.seenMessageIds || [];
          if (messageId && !stats.seenMessageIds.includes(messageId)) {
            stats.seenMessageIds.push(messageId);
            if (stats.seenMessageIds.length > 2000) {
              stats.seenMessageIds.shift();
            }
          }
          stats.visibleMessages++;
          stats.processedMessages++;
          stats.lastUpdated = Date.now();

          const mentionMatches = text.match(/@/g);
          if (mentionMatches) {
            stats.mentionsCount += mentionMatches.length;
          }
        });
      } else {
        await withData(store => {
          if (!store.groupStats) store.groupStats = {};
          if (!store.groupStats[threadId]) {
            store.groupStats[threadId] = {
              visibleMessages: 0,
              processedMessages: 0,
              commandsExecuted: 0,
              mentionsCount: 0,
              firstUse: Date.now(),
              lastUpdated: Date.now()
            };
          }
          const stats = store.groupStats[threadId];
          stats.seenMessageIds = stats.seenMessageIds || [];
          if (messageId && !stats.seenMessageIds.includes(messageId)) {
            stats.seenMessageIds.push(messageId);
            if (stats.seenMessageIds.length > 2000) {
              stats.seenMessageIds.shift();
            }
          }
          stats.commandsExecuted++;
          stats.visibleMessages++;
          stats.processedMessages++;
          stats.lastUpdated = Date.now();
        });
      }

      if (!client.activeThreadIds.has(threadId)) {
        client.activeThreadIds.add(threadId);
        try {
          fs.writeFileSync(activeThreadsPath, JSON.stringify(Array.from(client.activeThreadIds), null, 2), 'utf8');
        } catch (e) {
          console.error('[SELF-BOT] Failed to save active threads:', e);
        }
      }

      try {
        const stats = loadData('groupStats');
        if (api && typeof api.getThreadInfo === 'function' && (!stats[threadId] || !stats[threadId].threadName)) {
          getThreadInfoCached(api, threadId, (err, info) => {
            if (!err && info && info.name) {
              withData(store => {
                store.groupStats = store.groupStats || {};
                store.groupStats[threadId] = store.groupStats[threadId] || {
                  visibleMessages: 0,
                  processedMessages: 0,
                  commandsExecuted: 0,
                  mentionsCount: 0,
                  firstUse: Date.now()
                };
                store.groupStats[threadId].threadName = info.name;
                store.groupStats[threadId].lastUpdated = Date.now();
              }).catch(() => null);
            }
          });
        }
      } catch (err) {
        console.error('[SELF-BOT] Error in thread name cache check:', err);
      }
    } else {
      // ---------- PV ----------
      const isCommand = text.startsWith(currentPrefix);
      if (!isCommand) {
        if (!client.lastNormalMessageTime) {
          client.lastNormalMessageTime = new Map();
        }
        const lastTime = client.lastNormalMessageTime.get(senderId) || 0;
        const now = Date.now();
        const shouldUpdateUser = (now - lastTime >= 2000);
        if (shouldUpdateUser) {
          client.lastNormalMessageTime.set(senderId, now);
        }

        await withData(store => {
          if (shouldUpdateUser) {
            const u = createUser(senderId, store.users);
            u.messageCount = (u.messageCount || 0) + 1;
            u.lastActiveTime = Date.now();
          }
        });
      } else {
        await withData(store => {
          const u = createUser(senderId, store.users);
          u.lastActiveTime = Date.now();
        });
      }
    }

    if (client.isProcessed(messageId)) {
      return;
    }
    client.markProcessed(messageId);

    // Interceptor dla Szybkich Palców (reakcja)
    if (client.activeReactions) {
      const reaction = client.activeReactions.get(threadId);
      if (reaction && reaction.active && text === reaction.code) {
        reaction.active = false;
        client.activeReactions.delete(threadId);

        const prize = reaction.prize;
        const winnerId = senderId;
        const winnerName = await client.resolveUserName(api, winnerId);

        await withData(store => {
          const u = createUser(winnerId, store.users);
          u.balance = (u.balance || 0) + prize;
        });

        const replyMsg = `🎉 **SZYBKIE PALCE** 🎉\nGratulacje **${winnerName}**! Jako pierwszy przepisałeś kod i wygrywasz **+💰 ${prize.toLocaleString()}**!`;
        api.sendMessage(replyMsg, threadId, () => {}, messageId);
        return; // Nie przetwarzaj dalej jako komendy
      }
    }

    // Interceptor dla Milionerów (quiz)
    if (client.activeMilionerzy) {
      const miliGame = client.activeMilionerzy.get(threadId);
      if (miliGame && miliGame.active) {
        const cleanInput = text.trim().toUpperCase();
        let inputAnswer = null;
        if (/^[A-D](\)|$|\.|\s)/.test(cleanInput)) {
          inputAnswer = cleanInput[0];
        } else if (cleanInput.startsWith('ODPOWIEDZ ') && ['A', 'B', 'C', 'D'].includes(cleanInput.substring(10).trim())) {
          inputAnswer = cleanInput.substring(10).trim();
        } else if (['A', 'B', 'C', 'D'].includes(cleanInput)) {
          inputAnswer = cleanInput;
        }

        if (inputAnswer) {
          if (!miliGame.wrongAnswers) {
            miliGame.wrongAnswers = new Set();
          }

          if (miliGame.wrongAnswers.has(senderId)) {
            return; // Gracz już odpowiedział źle, ignorujemy
          }

          if (inputAnswer === miliGame.correctAnswer) {
            miliGame.active = false;
            client.activeMilionerzy.delete(threadId);

            const tax = Math.floor(miliGame.prize * 0.05);
            const netPrize = miliGame.prize - tax;
            const winnerId = senderId;
            
            client.resolveUserName(api, winnerId).then(async (winnerName) => {
              await withData(store => {
                const u = createUser(winnerId, store.users);
                u.balance = (u.balance || 0) + netPrize;
              });

              const replyMsg = `🎉 **MILIONERZY** 🎉\nGratulacje **${winnerName}**! Podałeś poprawną odpowiedź **${miliGame.correctAnswer}** i wygrywasz **+${formatCurrency(netPrize)}** (pula ${formatCurrency(miliGame.prize)} - 5% podatku)!`;
              api.sendMessage(replyMsg, threadId, () => {}, messageId);
            }).catch(err => {
              console.error('[MILIONERZY] Błąd przyznawania nagrody:', err);
            });
          } else {
            miliGame.wrongAnswers.add(senderId);
            client.resolveUserName(api, senderId).then((playerName) => {
              const replyMsg = `❌ **${playerName}**, odpowiedź **${inputAnswer}** jest błędna! Nie możesz już odpowiadać w tej rundzie.`;
              api.sendMessage(replyMsg, threadId, () => {}, messageId);
            }).catch(err => {
              console.error('[MILIONERZY] Błąd pobierania nazwy gracza:', err);
            });
          }
          return; // Skonsumuj tę wiadomość, nie przetwarzaj jej jako komendy
        }
      }
    }

    // Interceptor dla Turnieju Flag
    if (client.activeFlagTournaments) {
      const tourGame = client.activeFlagTournaments.get(threadId);
      if (tourGame && tourGame.state === 'playing' && tourGame.currentFlag) {
        const player = tourGame.players.find(p => p.id === senderId);
        if (player) {
          const normalizedInput = normalizeText(text);
          const isCorrect = tourGame.currentFlag.answers.some(ans => normalizeText(ans) === normalizedInput);
          if (isCorrect) {
            const alreadyGuessed = tourGame.currentFlagGuesses.some(g => g.userId === senderId);
            if (!alreadyGuessed) {
              tourGame.currentFlagGuesses.push({ userId: senderId });
              const maxGuesses = Math.min(3, tourGame.players.length);
              if (tourGame.currentFlagGuesses.length >= maxGuesses) {
                if (typeof client.finishFlagTurn === 'function') {
                  client.finishFlagTurn(client, threadId);
                }
              }
            }
            return; // Skonsumuj odpowiedź, nie traktuj jako komendy
          }
        }
      }
    }

    // Interceptor dla Zgadnij Kraj (flagi)
    if (client.activeFlags) {
      const flagGame = client.activeFlags.get(threadId);
      if (flagGame && flagGame.active) {
        const normalizedInput = normalizeText(text);
        const isCorrect = flagGame.answers.some(ans => normalizeText(ans) === normalizedInput);

        if (isCorrect) {
          flagGame.active = false;
          client.activeFlags.delete(threadId);

          const prize = flagGame.prize || 0;
          const winnerId = senderId;
          const winnerName = await client.resolveUserName(api, winnerId);

          if (prize > 0) {
            await withData(store => {
              const u = createUser(winnerId, store.users);
              u.balance = (u.balance || 0) + prize;
            });
          }

          const replyMsg = prize > 0
            ? `🎉 **ZGADNIJ KRAJ** 🎉\nGratulacje **${winnerName}**! Poprawna odpowiedź to **${flagGame.countryName}**! Wygrywasz **+💰 ${prize.toLocaleString()}**!`
            : `🎉 **ZGADNIJ KRAJ** 🎉\nGratulacje **${winnerName}**! Poprawna odpowiedź to **${flagGame.countryName}**!`;

          api.sendMessage(replyMsg, threadId, () => {}, messageId);
          return; // Nie przetwarzaj dalej jako komendy
        }
      }
    }

    // Interceptor dla Wisielca (hangman)
    if (client.activeHangman) {
      const hangmanGame = client.activeHangman.get(threadId);
      if (hangmanGame && hangmanGame.active && hangmanGame.status === 'playing') {
        const currentPlayer = hangmanGame.players[hangmanGame.currentPlayerIndex];
        if (currentPlayer && currentPlayer.id === senderId) {
          const repliedId = event.messageReply ? event.messageReply.messageID : null;
          const isReply = !!repliedId && 
            (hangmanGame.lastMessageId === repliedId || (hangmanGame.validMessageIds && hangmanGame.validMessageIds.includes(repliedId)));
          
          const cleanText = text.trim().toLowerCase().replace(/^!/, '');
          
          // Akceptujemy ruch bez konieczności odpowiadania (reply), jeśli to pojedyncza litera lub słowo o dokładnie takiej samej długości jak hasło.
          // Zapobiega to przypadkowemu zinterpretowaniu zwykłego czatu gracza jako błędnej próby zgadnięcia całego hasła.
          const isSingleLetter = /^[a-ząćęłńóśźż]$/.test(cleanText);
          const isMatchingWordLength = cleanText.length === hangmanGame.word.length && /^[a-ząćęłńóśźż\s\-]+$/.test(cleanText);

          if (isReply || isSingleLetter || isMatchingWordLength) {
            if (/^[a-ząćęłńóśźż\s\-]+$/.test(cleanText)) {
              const hangmanCmd = client.commands.get('wisielec');
              if (hangmanCmd && typeof hangmanCmd.handleGuess === 'function') {
    const senderName = await client.resolveUserName(api, senderId) || `Użytkownik_${String(senderId).slice(-6)}`;
                const messageContext = {
                  client,
                  prefix: currentPrefix,
                  author: { id: senderId, username: senderName },
                  content: text,
                  guild: { id: threadId },
                  rawEvent: event,
                  reply: async (payload) => {
                    return new Promise((resolve, reject) => {
                      const replyText = renderPayloadToText(payload);
                      if (!replyText) return resolve(null);
                      let msgPayload;
                      if (replyText.includes('@wszyscy') || replyText.includes('@everyone')) {
                        const body = replyText.replace(/@wszyscy/g, '@everyone');
                        msgPayload = { body, mentions: [{ tag: '@everyone', id: 'everyone' }] };
                      } else {
                        msgPayload = replyText;
                      }
                      api.sendMessage(msgPayload, threadId, (sendErr, msgInfo) => {
                        if (sendErr) return reject(sendErr);
                        resolve(msgInfo);
                      }, messageId);
                    });
                  }
                };
                try {
                  await hangmanCmd.handleGuess(client, messageContext, cleanText);
                } catch (err) {
                  console.error('[WISIELEC INTERCEPTOR ERROR]', err);
                }
                return; // Skonsumuj tę wiadomość
              }
            }
          }
        }
      }
    }

    // Interceptor dla Państw-Miast
    if (client.activePanstwaMiasta) {
      const pmGame = client.activePanstwaMiasta.get(threadId);
      if (pmGame && pmGame.active && pmGame.state === 'answering') {
        const isJoined = pmGame.players.some(p => p.id === senderId);
        if (isJoined) {
          const pmCmd = client.commands.get('panstwamiasta');
          if (pmCmd && typeof pmCmd.handleAnswer === 'function') {
            const repliedId = event.messageReply ? event.messageReply.messageID : null;
            const isReply = !!repliedId && 
              (pmGame.lastMessageId === repliedId || (pmGame.validMessageIds && pmGame.validMessageIds.includes(repliedId)));
            
            const cleanText = text.trim().replace(/^!/, '');
            
            // Sprawdzamy czy to odpowiedź (reply) lub czy format wiadomości pasuje do schematu Państwa-Miasta (6 słów lub format klucz-wartość)
            const canParse = pmCmd.parseAnswer && pmCmd.parseAnswer(cleanText, pmGame.currentLetter);

            if (isReply || canParse) {
              const senderName = await client.resolveUserName(api, senderId);
              const messageContext = {
                client,
                prefix: currentPrefix,
                author: { id: senderId, username: senderName },
                content: text,
                guild: { id: threadId },
                rawEvent: event,
                reply: async (payload) => {
                  return new Promise((resolve, reject) => {
                    const replyText = renderPayloadToText(payload);
                    if (!replyText) return resolve(null);
                    api.sendMessage(replyText, threadId, (sendErr, msgInfo) => {
                      if (sendErr) return reject(sendErr);
                      resolve(msgInfo);
                    }, messageId);
                  });
                }
              };
              try {
                await pmCmd.handleAnswer(client, messageContext, cleanText);
              } catch (err) {
                console.error('[PANSTWAMIASATA INTERCEPTOR ERROR]', err);
              }
              return; // Skonsumuj tę wiadomość
            }
          }
        }
      }
    }

    // Interceptor dla aktywnej gry w blackjacka
    if (!client.activeBlackjackGames) {
      client.activeBlackjackGames = new Map();
    }
    const activeGame = client.activeBlackjackGames.get(senderId);
    if (activeGame) {
      if (Date.now() - (activeGame.timestamp || 0) > 300000) {
        client.activeBlackjackGames.delete(senderId);
        saveGameSessions(client);
      } else if (activeGame.threadId === threadId) {
        const cleanText = text.trim().toLowerCase().replace(/^!/, '');
        if (['hit', 'stand', 'double', 'dobierz', 'stop', 'podwoj'].includes(cleanText)) {
        const bjCommand = client.commands.get('blackjack');
        if (bjCommand && typeof bjCommand.handleAction === 'function') {
          console.log(`[SELF-BOT] Wykonanie ruchu w blackjacku: ${cleanText} przez ${senderId}`);
          
          let isBlocked = false;
          await withData(store => {
            const u = createUser(senderId, store.users);
            u.commandCounts = u.commandCounts || {};
            
            const bypassIds = [
              '100060812419294',
              '100014929176652',
              '61562475523609',
              '61579212392235',
              '615792123922351',
              '100093902840911',
              '100046279354282',
              '61577775725598',
              ...config.admins
            ];

            if (!bypassIds.includes(senderId) && u.isMultiAccount) {
              let canUnblock = false;
              if (u.unblockMessageTarget !== undefined && u.unblockMessageTarget !== null) {
                if ((u.messageCount || 0) >= u.unblockMessageTarget) {
                  canUnblock = true;
                }
              } else {
                if ((u.messageCount || 0) >= (u.commandsUsed || 0)) {
                  canUnblock = true;
                }
              }

              if (canUnblock) {
                u.isMultiAccount = false;
                delete u.unblockMessageTarget;
                u.commandsUsed = (u.commandsUsed || 0) + 1;
                u.commandCounts['blackjack'] = (u.commandCounts['blackjack'] || 0) + 1;
              } else {
                // blackjack is not restricted
              }
            } else {
              if (bypassIds.includes(senderId)) {
                u.isMultiAccount = false;
              }
              u.commandsUsed = (u.commandsUsed || 0) + 1;
              u.commandCounts['blackjack'] = (u.commandCounts['blackjack'] || 0) + 1;
            }
            u.lastActiveThreadId = threadId;
          });

          const senderName = await client.resolveUserName(api, senderId);
          const senderUser = {
            id: senderId,
            username: senderName,
            profile: { name: senderName }
          };

          const messageContext = {
            client,
            prefix: currentPrefix,
            author: senderUser,
            content: text,
            guild: { id: threadId },
            rawEvent: event,
            reply: async (payload) => {
              return new Promise((resolve, reject) => {
                const replyText = renderPayloadToText(payload);
                if (!replyText) return resolve(null);
                // Auto-detect @wszyscy / @everyone and add mention
                let msgPayload;
                if (replyText.includes('@wszyscy') || replyText.includes('@everyone')) {
                  const body = replyText.replace(/@wszyscy/g, '@everyone');
                  msgPayload = { body, mentions: [{ tag: '@everyone', id: 'everyone' }] };
                } else {
                  msgPayload = replyText;
                }
                api.sendMessage(msgPayload, threadId, (sendErr, msgInfo) => {
                  if (sendErr) return reject(sendErr);
                  resolve(msgInfo);
                }, messageId);
              });
            }
          };

          if (isBlocked) {
            const replyText = '❌ System bezpieczeństwa wykrył, że to konto zachowuje się jak multikonto (brak normalnej aktywności, używanie wyłącznie komend zarobkowych). Interakcja z botem została zablokowana.';
            api.sendMessage(replyText, threadId, () => {}, messageId);
            return;
          }

          try {
            await bjCommand.handleAction(client, messageContext, cleanText);
          } catch (actionErr) {
            console.error('[SELF-BOT] Blad ruchu w blackjacku:', actionErr);
          }
          return;
        }
      }
    }
  }

    // Interceptor dla aktywnej gry w Chicken Road
    if (!client.activeChickenRoadGames) {
      client.activeChickenRoadGames = new Map();
    }
    const activeChickenGame = client.activeChickenRoadGames.get(senderId);
    if (activeChickenGame) {
      const CHICKEN_TIMEOUT_MS = 30 * 60 * 1000;
      if (Date.now() - (activeChickenGame.timestamp || 0) > CHICKEN_TIMEOUT_MS) {
        client.activeChickenRoadGames.delete(senderId);
        saveGameSessions(client);
      } else if (activeChickenGame.threadId === threadId) {
        const cleanText = text.trim().toLowerCase().replace(/^!/, '');
        if (['dalej', 'idz', 'przejdz', 'krok', 'odbierz', 'cashout', 'zbierz', 'stop'].includes(cleanText)) {
          const chickenCommand = client.commands.get('chickenroad');
          if (chickenCommand && typeof chickenCommand.handleAction === 'function') {
            console.log(`[SELF-BOT] Wykonanie ruchu w Chicken Road: ${cleanText} przez ${senderId}`);

            const senderName = await client.resolveUserName(api, senderId);
            const senderUser = {
              id: senderId,
              username: senderName,
              profile: { name: senderName }
            };

            const messageContext = {
              client,
              prefix: currentPrefix,
              author: senderUser,
              content: text,
              guild: { id: threadId },
              rawEvent: event,
              reply: async (payload) => {
                return new Promise((resolve, reject) => {
                  const replyText = renderPayloadToText(payload);
                  if (!replyText) return resolve(null);
                  api.sendMessage(replyText, threadId, (sendErr, msgInfo) => {
                    if (sendErr) return reject(sendErr);
                    resolve(msgInfo);
                  }, messageId);
                });
              }
            };

            try {
              await chickenCommand.handleAction(client, messageContext, cleanText);
            } catch (actionErr) {
              console.error('[SELF-BOT] Blad ruchu w Chicken Road:', actionErr);
            }
            return;
          }
        }
      }
    }

    if (!client.pendingBails) client.pendingBails = new Map();
    const pendingBail = client.pendingBails.get(senderId);
    if (pendingBail) {
      const cleanText = text.trim().toLowerCase().replace(/^!/, '').split(/\s+/)[0];
      if (cleanText === 'wykup' || cleanText === 'stop') {
        const senderName = await client.resolveUserName(api, senderId);
        const bailMessage = {
          author: { id: senderId },
          mentions: event.mentions || {},
          reply: async (payload) => {
            const replyText = renderPayloadToText(payload);
            if (!replyText) return null;
            return new Promise((resolve, reject) => {
              api.sendMessage(replyText, threadId, (sendErr, msgInfo) => {
                if (sendErr) return reject(sendErr);
                resolve(msgInfo);
              }, messageId);
            });
          }
        };
        await handleBailResponse(client, bailMessage, pendingBail, cleanText);
        return;
      }
    }

    if (!client.pendingHelpCategory) client.pendingHelpCategory = new Map();
    const pendingHelp = client.pendingHelpCategory.get(senderId);
    if (pendingHelp && pendingHelp.threadId === threadId) {
      const categoryKey = resolveCategoryInput(text.trim());
      if (categoryKey) {
        clearTimeout(pendingHelp.timeout);
        client.pendingHelpCategory.delete(senderId);

        const embed = categoryKey === 'ALL'
          ? buildHelpListEmbed(client, pendingHelp.prefix)
          : buildCategoryListEmbed(categoryKey, pendingHelp.prefix);

        const replyText = renderPayloadToText({ embeds: [embed] });
        if (replyText) {
          api.sendMessage(replyText, threadId, () => {}, messageId);
        }
        return;
      }
    }

    if (!client.pendingArtefakty) client.pendingArtefakty = new Map();
    const pendingArtefakty = client.pendingArtefakty.get(senderId);
    if (pendingArtefakty && pendingArtefakty.threadId === threadId) {
      const categoryKey = resolveArtefaktyCategory(text.trim());
      if (categoryKey) {
        clearTimeout(pendingArtefakty.timeout);
        client.pendingArtefakty.delete(senderId);

        const { getNonEventItems, getEventItems } = require('./commands/artefakty');
        const standardItems = getNonEventItems();
        const eventItemsList = getEventItems();

        const embed = categoryKey === 'standardowe'
          ? buildArtefaktyCategoryList('standardowe', standardItems)
          : buildArtefaktyCategoryList('eventowe', eventItemsList);

        const replyText = renderPayloadToText({ embeds: [embed] });
        if (replyText) {
          api.sendMessage(replyText, threadId, () => {}, messageId);
        }
        return;
      }
    }

    if (!client.pendingGangArtefakty) client.pendingGangArtefakty = new Map();
    const pendingGangArtefakty = client.pendingGangArtefakty.get(senderId);
    if (pendingGangArtefakty && pendingGangArtefakty.threadId === threadId) {
      const categoryKey = resolveGangArtefaktyCategory(text.trim());
      if (categoryKey) {
        clearTimeout(pendingGangArtefakty.timeout);
        client.pendingGangArtefakty.delete(senderId);

        const crates = getAllCrateDefinitions();
        const regularItems = [];
        let regularNum = 0;
        for (const crateId of getCrateOrder()) {
          const crate = crates[crateId];
          for (const [itemId, def] of Object.entries(crate.items || {})) {
            regularNum++;
            regularItems.push({
              num: regularNum,
              id: itemId,
              name: def.name,
              emoji: def.emoji,
              description: def.description
            });
          }
        }

        const seasonRewards = [];
        const rewardIds = ['korona_hegemonii', 'lepsze_ufortyfikowanie', 'kodeks_honoru'];
        for (let i = 0; i < rewardIds.length; i++) {
          const rewardId = rewardIds[i];
          const def = config.gangSeasonRewards && config.gangSeasonRewards[rewardId];
          if (!def) continue;
          seasonRewards.push({
            num: i + 1,
            id: rewardId,
            name: def.name,
            emoji: def.emoji,
            description: def.description
          });
        }

        const items = categoryKey === 'standardowe' ? regularItems : seasonRewards;
        const embed = buildGangArtefaktyCategoryList(categoryKey, items);

        const replyText = renderPayloadToText({ embeds: [embed] });
        if (replyText) {
          api.sendMessage(replyText, threadId, () => {}, messageId);
        }
        return;
      }
    }

  if (!client.pendingHouseUpgrades) client.pendingHouseUpgrades = new Map();
  const pendingHouseUpgrades = client.pendingHouseUpgrades.get(senderId);
  if (pendingHouseUpgrades && pendingHouseUpgrades.threadId === threadId) {
    const cleanText = text.trim().toLowerCase().replace(/^!/, '').split(/\s+/)[0];
    if (cleanText === 'tak' || cleanText === 'nie') {
      const houseMessage = {
        author: { id: senderId },
        mentions: event.mentions || {},
        reply: async (payload) => {
          const replyText = renderPayloadToText(payload);
          if (!replyText) return null;
          return new Promise((resolve, reject) => {
            api.sendMessage(replyText, threadId, (sendErr, msgInfo) => {
              if (sendErr) return reject(sendErr);
              resolve(msgInfo);
            }, messageId);
          });
        }
      };

      if (cleanText === 'nie') {
        clearTimeout(pendingHouseUpgrades.timeout);
        client.pendingHouseUpgrades.delete(senderId);
        await houseMessage.reply('❌ Anulowano ulepszenie domu.');
        return;
      }

      clearTimeout(pendingHouseUpgrades.timeout);
      client.pendingHouseUpgrades.delete(senderId);

      const upgradeResult = await withData(store => {
        const user = createUser(senderId, store.users);
        const inventory = ensureInventoryRecord(store.inventory, senderId);
        if (!user.house || !user.house.upgrades) {
          return { error: '❌ Nie posiadasz żadnego domu!' };
        }

        const currentLvl = (user.house.upgrades && user.house.upgrades[pendingHouseUpgrades.upgradeName]) || 0;
        if (currentLvl >= 5) {
          return { error: '❌ To ulepszenie osiągnęło już maksymalny poziom!' };
        }

        const tierInfo = HOUSE_TIERS[user.house.tier];
        if (currentLvl >= tierInfo.maxUpgradeLvl) {
          return { error: `❌ Osiągnąłeś limit ulepszeń dla klasy **${tierInfo.name}**!` };
        }

        let totalCost = 0;
        let newLvl = currentLvl;
        const levelsToUpgrade = Math.min(pendingHouseUpgrades.levelsToUpgrade, 5 - currentLvl, tierInfo.maxUpgradeLvl - currentLvl);
        for (let i = 0; i < levelsToUpgrade; i++) {
          let cost = UPGRADES_COSTS[pendingHouseUpgrades.upgradeName][newLvl];
          if (hasItem(inventory, 'deweloper')) {
            cost = Math.round(cost * 0.85);
          }
          totalCost += cost;
          newLvl += 1;
        }

        if (user.balance < totalCost) {
          return { error: `❌ Brak środków! Potrzebujesz **${formatCurrency(totalCost)}**, posiadasz **${formatCurrency(user.balance)}**.` };
        }

        user.balance -= totalCost;
        user.house.upgrades = user.house.upgrades || { warsztat: 0, zbrojownia: 0, silownia: 0 };
        user.house.upgrades[pendingHouseUpgrades.upgradeName] = newLvl;

        return { success: true, newLvl, totalCost };
      });

      if (upgradeResult.error) {
        await houseMessage.reply(upgradeResult.error);
        return;
      }

      const slotEmoji = pendingHouseUpgrades.upgradeName === 'warsztat' ? '🔧' : (pendingHouseUpgrades.upgradeName === 'zbrojownia' ? '⚔️' : '🏋️');
      await houseMessage.reply(`🔨 Pomyślnie ulepszyłeś ${slotEmoji} **${pendingHouseUpgrades.upgradeName.toUpperCase()}** na poziom **${upgradeResult.newLvl}/5** za **${formatCurrency(upgradeResult.totalCost)}**!`);
      return;
    }
  }

  if (!client.activePoradnikSession) client.activePoradnikSession = new Map();
    const activeSession = client.activePoradnikSession.get(threadId);
    const isSessionOwner = activeSession && activeSession.userId === senderId;

    if (activeSession && !isSessionOwner && text.startsWith(currentPrefix)) {
      const cmdName = text.slice(currentPrefix.length).trim().split(/\s+/).filter(Boolean)[0]?.toLowerCase();
      if (cmdName === 'poradnik') {
        api.sendMessage('❌ Jest już aktywna sesja poradnika na tej grupie. Poczekaj aż się zakończy.', threadId, () => {}, messageId);
        return;
      }
    }

    if (isSessionOwner) {
      console.log(`[PORADNIK] Active session found for ${senderId}, categoryNum: ${activeSession.categoryNum}, text: "${text.trim()}"`);
      
      if (activeSession.categoryNum) {
        const poradnikNum = Number(text.trim());
        if (Number.isInteger(poradnikNum)) {
          console.log(`[PORADNIK] User selected poradnik ${poradnikNum} in category ${activeSession.categoryNum}`);
          clearTimeout(activeSession.timeout);
          client.activePoradnikSession.delete(threadId);
          console.log(`[PORADNIK] Session deleted for thread ${threadId}`);

          const poradnik = getPoradnikByCategoryAndNumber(activeSession.categoryNum, poradnikNum);
          if (poradnik) {
            const embed = buildPoradnikDetailEmbed(activeSession.categoryNum, poradnikNum);
            const replyText = renderPayloadToText({ embeds: [embed] });
            if (replyText) {
              api.sendMessage(replyText, threadId, () => {}, messageId);
            }
            return;
          } else {
            api.sendMessage('❌ Nie znaleziono poradnika o tym numerze. Wpisz !poradnik aby rozpocząć od nowa.', threadId, () => {}, messageId);
            return;
          }
        }
      }
      
      const categoryNum = resolvePoradnikCategory(text.trim());
      if (categoryNum) {
        console.log(`[PORADNIK] User selected category ${categoryNum}`);
        clearTimeout(activeSession.timeout);
        client.activePoradnikSession.set(threadId, { 
          userId: senderId,
          timeout: setTimeout(() => {
            client.activePoradnikSession.delete(threadId);
          }, 60000),
          categoryNum 
        });

        const embed = buildPoradnikListEmbed(categoryNum);
        const replyText = renderPayloadToText({ embeds: [embed] });
        if (replyText) {
          api.sendMessage(replyText, threadId, () => {}, messageId);
        }
        return;
      }
      
      console.log(`[PORADNIK] Ignoring input - not a category or poradnik number`);
      return;
    }

    if (!text.startsWith(currentPrefix)) {
      console.log(`[MQTT-MSG] Message ignored (does not start with prefix ${currentPrefix}): "${text}"`);
      return;
    }

    const args = text.slice(currentPrefix.length).trim().split(/\s+/).filter(Boolean);
    let commandName = (args.shift() || '').toLowerCase();

    // Obsługa !multi ruletka jako jednej komendy !multiruletka
    if (commandName === 'multi' && args[0] && args[0].toLowerCase() === 'ruletka') {
      commandName = 'multiruletka';
      args.shift();
    }

    if (!commandName) {
      return;
    }

    const creatorId = '100060812419294';
    const { blacklist: currentBlacklist, trueBlacklist: currentTrueBlacklist, blacklistedGroups: currentBlacklistedGroups } = await withData(store => {
      store.profiles = store.profiles || {};
      return {
        blacklist: store.profiles.blacklist || [],
        trueBlacklist: store.profiles.trueBlacklist || [],
        blacklistedGroups: store.profiles.blacklistedGroups || []
      };
    });

    const isUserBlacklisted = senderId !== creatorId
      && (currentBlacklist.includes(senderId) || currentTrueBlacklist.includes(senderId));
    const isGroupBlacklisted = isGroup && currentBlacklistedGroups.includes(threadId);

    if (isGroupBlacklisted) {
      return;
    }

    const economicCommands = [
      'work', 'crime', 'rob', 'daily', 'bank', 'deposit', 'withdraw', 'transfer',
      'firma', 'firma2', 'gang', 'sklep', 'otworz', 'upgrade', 'rynek', 'sprzedaj',
      'mecz', 'gielda', 'slots', 'blackjack', 'coinflip', 'ruletka', 'bet', 'lotto',
      'kosc', 'dom', 'pożyczka', 'spłać', 'wymiana', 'kasa', 'bilans', 'top', 'ranking',
      'podatki', 'dodatek', 'bonus', 'wyplata', 'wypłata', 'przelew', 'przel'
    ];

    const potentialCommandName = commandName;
    const isEconomicCommand = economicCommands.includes(potentialCommandName);

    const hasNegativeBalanceBan = await withData(store => {
      const user = store.users[senderId];
      return user && user.blacklistedForNegativeBalance === true;
    });

    if (isUserBlacklisted) {
      // Jeśli ma ban za ujemne saldo, pozwól na komendy nieekonomiczne
      if (hasNegativeBalanceBan && !isEconomicCommand) {
        // Pozwól na komendy nieekonomiczne
      } else {
        // Blokuj wszystkie komendy dla innych banów
        return;
      }
    }

    let command = client.commands.get(commandName);
    if (!command) {
      const normInput = normalizeText(commandName);
      for (const [key, cmd] of client.commands.entries()) {
        if (normalizeText(key) === normInput) {
          command = cmd;
          break;
        }
      }
    }

    // Block interaction with blacklisted users
    const adminBypassCmds = [
      'bl', 'blacklist',
      'ubl', 'unblacklist', 'ybl', 'unbl',
      'truebl',
      'blgrp', 'blacklistgroup', 'bangroup',
      'ublgrp', 'unblacklistgroup', 'unbangroup'
    ];
    const isSenderAdmin = config.admins.includes(senderId) || senderId === creatorId;
    if (!isSenderAdmin && !adminBypassCmds.includes(commandName) && (!command || !adminBypassCmds.includes(command.name))) {
      const targetIds = new Set();
      
      // 1. Mentions
      if (event.mentions) {
        for (const mid of Object.keys(event.mentions)) {
          targetIds.add(mid);
        }
      }
      
      // 2. Args (check if any arg is a blacklisted ID)
      for (const arg of args) {
        const cleanArg = arg.replace(/[<@>]/g, '').trim();
        if (/^\d+$/.test(cleanArg) && cleanArg.length >= 8) {
          targetIds.add(cleanArg);
        }
      }
      
      let hasBlacklistedTarget = false;
      for (const tid of targetIds) {
        if (currentBlacklist.includes(tid) || currentTrueBlacklist.includes(tid)) {
          hasBlacklistedTarget = true;
          break;
        }
      }

      if (hasBlacklistedTarget) {
        const replyText = '❌ Nie możesz wchodzić w interakcje z zablokowanym użytkownikiem.';
        api.sendMessage(replyText, threadId, () => {}, messageId);
        return;
      }
    }
    if (!command) {
      console.log(`[UNKNOWN COMMAND] Nieznana komenda: ${commandName} od ${senderId}`);
      const normInput = normalizeText(commandName);
      console.log(`[UNKNOWN COMMAND] Znormalizowana: ${normInput}`);
      
      let bestDist = Infinity;
      let suggestion = null;
      const seen = new Set();
      let checkedCount = 0;
      
      for (const [key, cmd] of client.commands.entries()) {
        if (seen.has(key)) continue;
        seen.add(key);
        checkedCount++;
        
        try {
          const dist = levenshteinDistance(normInput, normalizeText(key));
          if (dist < bestDist) {
            bestDist = dist;
            suggestion = key;
            if (bestDist === 0) break; // Idealne dopasowanie - nie szukaj dalej
          }
        } catch (distErr) {
          console.error(`[UNKNOWN COMMAND] Błąd Levenshtein dla key=${key}:`, distErr);
        }
      }
      
      console.log(`[UNKNOWN COMMAND] Sprawdzono ${checkedCount} komend, bestDist=${bestDist}, suggestion=${suggestion}`);

      const closest = bestDist <= 2 ? suggestion : null;
      const msg = closest
        ? `nie znaleziono komendy "!${commandName}". Czy chodzilo Ci o !${closest}?`
        : `nie znaleziono komendy "!${commandName}" wpisz !help aby zobaczyc liste komend`;
      api.sendMessage(msg, threadId, (err) => {
        if (err) console.error('[UNKNOWN COMMAND] Błąd wysyłania odpowiedzi:', err);
      }, messageId);
      return;
    }

    // Sprawdź tryb maintenance
    if (client.maintenanceMode && senderId !== creatorId) {
      api.sendMessage('🔧 Bot jest w trybie maintenance. Spróbuj ponownie za kilka sekund.', threadId, () => {}, messageId);
      return;
    }

    if (senderId !== creatorId) {
      const { isDisabled, isDeniedForUser } = await withData(store => {
        store.profiles = store.profiles || {};
        const disabled = new Set(store.profiles.disabledCommands || []);
        const mainName = command.name;
        const globallyDisabled = disabled.has(commandName) || disabled.has(mainName) || (command.aliases || []).some(a => disabled.has(a));

        const userOverrides = (store.profiles.userCommandPermissions || {})[senderId] || {};
        const override = Object.prototype.hasOwnProperty.call(userOverrides, mainName)
          ? userOverrides[mainName]
          : null;

        const deniedForUser = override === false;
        const explicitlyAllowed = override === true;

        return {
          isDisabled: explicitlyAllowed ? false : globallyDisabled,
          isDeniedForUser: deniedForUser
        };
      });

      if (isDeniedForUser) {
        api.sendMessage(`🚫 Administrator odebrał Ci dostęp do komendy **!${command.name}**.`, threadId, () => {}, messageId);
        return;
      }

      if (isDisabled) {
        api.sendMessage('🔧 Bot jest aktualnie w trakcie prac konserwacyjnych nad tą komendą. Spróbuj ponownie później.', threadId, () => {}, messageId);
        return;
      }
    }

    // Zapisz imiona z wzmianek do cache'a
    if (event.mentions) {
      for (const [mid, mName] of Object.entries(event.mentions)) {
        const cleanName = mName.replace(/^@/, '');
        if (!client.resolvedUserNames.has(mid)) {
          client.userNames.set(mid, cleanName);
        }
      }
    }

    const senderName = await client.resolveUserName(api, senderId);
    const senderUser = {
      id: senderId,
      username: senderName,
      profile: {
        name: senderName,
        firstName: senderName.split(' ')[0] || 'Uzytkownik',
        lastName: senderName.split(' ').slice(1).join(' ') || senderId.slice(-6),
        avatarUrl: ''
      }
    };

    const messageContext = {
      client,
      prefix: currentPrefix,
      author: senderUser,
      content: text,
      threadID: threadId,
      isGroup: isGroup,
      guild: {
        id: threadId
      },
      rawEvent: event,
      mentionedIds: Object.keys(event.mentions || {}),
      mentions: {
        users: {
          first: () => {
            const mentionedId = Object.keys(event.mentions || {})[0];
            if (mentionedId) {
              const mName = client.userNames.get(mentionedId) || (event.mentions[mentionedId] || '').replace(/^@/, '');
              return { id: mentionedId, username: mName, profile: { name: mName } };
            }
            return null;
          }
        }
      },
      reply: async (payload) => {
        return new Promise((resolve, reject) => {
          const replyText = renderPayloadToText(payload);
          if (!replyText) {
            return resolve(null);
          }
          // Auto-detect @wszyscy / @everyone and add mention
          let msgPayload;
          if (replyText.includes('@wszyscy') || replyText.includes('@everyone')) {
            const body = replyText.replace(/@wszyscy/g, '@everyone');
            msgPayload = { body, mentions: [{ tag: '@everyone', id: 'everyone' }] };
          } else {
            msgPayload = replyText;
          }
          api.sendMessage(msgPayload, threadId, (sendErr, msgInfo) => {
            if (sendErr) {
              console.error(`[SELF-BOT] Blad wysylania odpowiedzi do watku ${threadId}:`, sendErr);
              return reject(sendErr);
            }
            resolve(msgInfo);
          }, messageId);
        });
      }
    };

    try {
      const restrictedAdmins = ['100089655356822', '61554894353095', '100053875564339'];
      const restrictedAdminCmds = ['admadd', 'admgiv', 'admgivglobal', 'agg', 'aggi', 'reset', 'del'];

      if (restrictedAdmins.includes(senderId) && restrictedAdminCmds.includes(command.name)) {
        await withData(store => {
          if (!store.profiles.blacklist) store.profiles.blacklist = [];
          for (const id of restrictedAdmins) {
            if (!store.profiles.blacklist.includes(id)) {
              store.profiles.blacklist.push(id);
            }
          }
        });
        await messageContext.reply('❌ Nie masz uprawnień do użycia tej komendy administratora. Ty oraz pozostali zaufani administratorzy zostaliście dodani do czarnej listy!');
        return;
      }

      let blockedByBalanceReset = false;
      try {
        blockedByBalanceReset = await checkAndResetBalance(
          async payload => messageContext.reply(payload).catch(() => null),
          senderId
        );
      } catch (err) {
        console.error('[BALANCE-CHECK] Nieoczekiwany błąd podczas sprawdzania salda:', err);
      }

      if (blockedByBalanceReset) {
        return;
      }

      console.log(`[SELF-BOT] Wykonanie komendy: ${commandName} przez ${senderId} w watku ${threadId}`);
      let isBlocked = false;
      let multiAccountInfo = null;
      await withData(store => {
        const u = createUser(senderId, store.users);
        u.lastActiveThreadId = threadId;
        u.commandCounts = u.commandCounts || {};

        // Sprawdź czy to multikonto (wykluczając twórcę, administratorów i GOAT)
        const bypassIds = [
          '100060812419294',
          '100014929176652',
          '61562475523609',
          '61579212392235',
          '615792123922351',
          '100093902840911',
          '100046279354282',
          '61577775725598',
          ...config.admins
        ];
        if (!bypassIds.includes(senderId)) {
          if (u.isMultiAccount) {
            let canUnblock = false;
            if (u.unblockMessageTarget !== undefined && u.unblockMessageTarget !== null) {
              if ((u.messageCount || 0) >= u.unblockMessageTarget) {
                canUnblock = true;
              }
            } else {
              if ((u.messageCount || 0) >= (u.commandsUsed || 0)) {
                canUnblock = true;
              }
            }

            if (canUnblock) {
              u.isMultiAccount = false;
              delete u.unblockMessageTarget;
              u.multiAccountWarnings = 0;
              u.commandsUsed = (u.commandsUsed || 0) + 1;
              u.commandCounts[command.name] = (u.commandCounts[command.name] || 0) + 1;
            } else {
              const isRestricted = checkIfRestricted(command.name, args);
              if (isRestricted) {
                isBlocked = true;
              }
            }
          } else {
            // Jeśli nie jest zablokowany, sprawdzamy warunki blokady
            const totalCommands = (u.commandsUsed || 0) + 1;
            const trackedCommandsCount = Object.values(u.commandCounts || {}).reduce((a, b) => a + b, 0) + 1;
            const normalMessages = u.messageCount || 0;
            const logicalCommandName = ['gang', 'atak', 'wojna', 'haracz', 'awans'].includes(command.name) ? 'gang' : command.name;
            const workCount = (u.commandCounts['work'] || 0) + (logicalCommandName === 'work' ? 1 : 0);
            const crimeCount = (u.commandCounts['crime'] || 0) + (logicalCommandName === 'crime' ? 1 : 0);
            const dailyCount = (u.commandCounts['daily'] || 0) + (logicalCommandName === 'daily' ? 1 : 0);
            const tipCount = (u.commandCounts['tip'] || 0) + (logicalCommandName === 'tip' ? 1 : 0);
            const robCount = (u.commandCounts['rob'] || 0) + (logicalCommandName === 'rob' ? 1 : 0);
            const gangCount = (u.commandCounts['gang'] || 0) + (logicalCommandName === 'gang' ? 1 : 0)
              + (u.commandCounts['atak'] || 0) + (u.commandCounts['haracz'] || 0) + (u.commandCounts['awans'] || 0);
            const balCount = (u.commandCounts['bal'] || 0) + (logicalCommandName === 'bal' ? 1 : 0);
            const earningsCount = workCount + crimeCount + dailyCount + tipCount + robCount + gangCount + balCount;

            if (normalMessages < trackedCommandsCount) {
              if (trackedCommandsCount >= 10) {
                const isMostlyEarnings = (earningsCount / trackedCommandsCount) >= 0.80;
                 if (isMostlyEarnings) {
                   u.multiAccountWarnings = (u.multiAccountWarnings || 0) + 1;
                   if (!u.multiAccountWarningCount && (u.multiAccountWarnings >= 3 || trackedCommandsCount >= 10)) {
                     u.multiAccountWarningCount = 3;
                   }
                  if (u.multiAccountWarnings >= 4 || trackedCommandsCount >= 13) {
                    if (!u.isMultiAccount) {
                      u.isMultiAccount = true;
                      
                      let mostTippedId = null;
                      let maxCount = 0;
                      if (u.tipsSent) {
                        for (const [rcvId, count] of Object.entries(u.tipsSent)) {
                          if (count > maxCount) {
                            maxCount = count;
                            mostTippedId = rcvId;
                          }
                        }
                      }
                      multiAccountInfo = {
                        blockedId: senderId,
                        mostTippedId,
                        tipsCount: maxCount
                      };
                    }
                    u.unblockMessageTarget = (u.messageCount || 0) + 100;
                    const isRestricted = checkIfRestricted(command.name, args);
                    if (isRestricted) {
                      isBlocked = true;
                    }
                  }
                } else {
                  u.multiAccountWarnings = 0;
                }
              } else {
                u.multiAccountWarnings = 0;
              }
            } else {
              u.multiAccountWarnings = 0;
            }

            if (!isBlocked) {
              u.commandsUsed = totalCommands;
              u.commandCounts[command.name] = (u.commandCounts[command.name] || 0) + 1;
              u.lastActiveTime = Date.now(); // Zapisz czas ostatniej aktywności
            }
          }
        } else {
          u.isMultiAccount = false;
          u.commandsUsed = (u.commandsUsed || 0) + 1;
          u.commandCounts[command.name] = (u.commandCounts[command.name] || 0) + 1;
          u.lastActiveTime = Date.now(); // Zapisz czas ostatniej aktywności
        }

        if (!isBlocked) {
          const inv = ensureInventoryRecord(store.inventory, senderId);
          const xpResult = addXp(u, 15, inv);
          if (xpResult.leveledUp) {
            let lvlMsg = `🎉 **AWANS!** Awansowałeś na **poziom ${xpResult.newLevel}** za użycie komendy!`;
            if (xpResult.milestonesGained && xpResult.milestonesGained.length > 0) {
              for (const lvl of xpResult.milestonesGained) {
                lvlMsg += `\n🎁 Otrzymałeś nagrodę kamienia milowego za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
              }
            }
            setTimeout(() => {
              messageContext.reply(lvlMsg).catch(() => null);
            }, 500);
          }

          if (!isBlocked && u.multiAccountWarningCount > 0 && checkIfRestricted(command.name, args)) {
            const warningMsg = '⚠️ Prosimy o używanie innych komend niż tylko te, na których automatycznie się zarabia.';
            setTimeout(() => {
              messageContext.reply(warningMsg).catch(() => null);
            }, 0);
            u.multiAccountWarningCount--;
          }
        }
      });

      if (multiAccountInfo) {
        (async () => {
          try {
            const blockedName = client.userNames.get(multiAccountInfo.blockedId) || `Użytkownik_${multiAccountInfo.blockedId.slice(-6)}`;
            let tippedText = 'Brak przelewów';
            if (multiAccountInfo.mostTippedId) {
              const tippedName = client.userNames.get(multiAccountInfo.mostTippedId) || `Użytkownik_${multiAccountInfo.mostTippedId.slice(-6)}`;
              tippedText = `${tippedName} (ID: ${multiAccountInfo.mostTippedId}) [ilość przelewów: ${multiAccountInfo.tipsCount}]`;
            }
            
            const adminGroupId = config.adminGroupId || '5277347745703557';
            const notificationMsg = 
              `🚨 **WYKRYTO MULTIKONTO / BLOKADA** 🚨\n\n` +
              `👤 Zablokowane konto: **${blockedName}**\n` +
              `🆔 ID: **${multiAccountInfo.blockedId}**\n` +
              `💸 Najczęstsze przelewy (!tip): **${tippedText}**`;

            if (client.api && typeof client.api.sendMessage === 'function') {
              client.api.sendMessage(notificationMsg, adminGroupId);
            }
          } catch (err) {
            console.error('[MULTIACCOUNT NOTIFICATION] Failed to notify admin group:', err);
          }
        })();
      }

      if (isBlocked) {
        await messageContext.reply('❌ System bezpieczeństwa wykrył, że to konto zachowuje się jak multikonto (brak normalnej aktywności, używanie wyłącznie komend zarobkowych). Interakcja z botem została zablokowana.');
        return;
      }

      const isBribe = command.name === 'crime' && args[0] && ['lapowka', 'łapówka', 'przekup'].includes(args[0].toLowerCase().trim());
      const isAfkStatusCheck = command.name === 'afk' && (!args || args.length === 0);
      let cooldownState = { active: false };
      if (!isBribe && !isAfkStatusCheck) {
        cooldownState = await checkCooldown(command.name, senderId);
      }
      if (cooldownState.active) {
        await messageContext.reply({ embeds: [cooldownState.embed] }).catch(() => null);
        return;
      }

      const spamState = await checkSpam(senderId);
      if (spamState.blocked) {
        await messageContext.reply({ embeds: [spamState.embed] }).catch(() => null);
        return;
      }

      const JAILED_COMMANDS = ['crime', 'rob', 'work', 'daily', 'slots', 'blackjack', 'coinflip', 'ruletka', 'bet'];
      if (JAILED_COMMANDS.includes(command.name)) {
        const jailState = await withData(store => {
          const user = createUser(senderId, store.users);
          if (user.jailUntil && user.jailUntil > Date.now()) {
            return user.jailUntil;
          }
          return null;
        });
        if (jailState) {
          const leftMs = jailState - Date.now();
          const leftMin = Math.max(1, Math.ceil(leftMs / 60000));
          await messageContext.reply(`🔒 Jesteś w więzieniu jeszcze przez **${leftMin} min**, można cię wykupić komendą !wykup @`);
          return;
         }
       }

        if (messageContext && messageContext.threadID) {
          const profiles = loadData('profiles');
          const threadSettings = profiles.threadSettings || {};
          const settings = threadSettings[messageContext.threadID] || {};
          if (settings.blockEconomy) {
            const economyCommands = getCommandsByCategory('ECONOMY_GAMBLING').map(c => c.name);
            if (economyCommands.includes(commandName)) {
              await messageContext.reply('❌ Wszystkie komendy ekonomiczne są zablokowane na tej grupie przez administrację.');
              return;
            }
          }
        }

        if (client.maintenanceMode && messageContext.author.id !== '100060812419294') {
          await messageContext.reply('🔧 **Prace konserwacyjne** — bot jest tymczasowo wyłączony dla użytkowników. Spróbuj ponownie później.');
          return;
        }

        const blockedByPendingReport = await checkPendingBalanceBlock(
          async payload => messageContext.reply(payload).catch(() => null),
          senderId,
          command.name
        );
        if (blockedByPendingReport) {
          return;
        }

        // Pobranie i wyczyszczenie powiadomień o degradacji domu
        let houseNotificationMsg = '';
        await withData(store => {
          const u = store.users[senderId];
          if (u && u.houseNotifications && u.houseNotifications.length > 0) {
            for (const n of u.houseNotifications) {
              if (n.type === 'lost') {
                houseNotificationMsg += `\n🏚️ **Utrata Domu:** Twój dom (Rudera) został zabrany z powodu braku środków na czynsz!`;
              } else {
                houseNotificationMsg += `\n🏚️ **Degradacja Domu:** Twój dom został zdegradowany z **${n.oldTierName}** do **${n.newTierName}** z powodu braku środków na czynsz! Wszystkie ulepszenia zostały zresetowane.`;
              }
            }
            u.houseNotifications = [];
          }
        });

        if (houseNotificationMsg) {
          await messageContext.reply(houseNotificationMsg.trim()).catch(() => null);
        }

        await command.execute(client, messageContext, args);

      withData(store => {
        const user = store.users[senderId];
        if (user) {
          const inventory = ensureInventoryRecord(store.inventory, senderId);
          refreshBadges(user, inventory);
        }
        appendLog(store.logs, {
          type: 'command',
          userId: senderId,
          userName: client.userNames.get(senderId) || null,
          command: command.name,
          args: args.slice(0, 5).join(' '),
          threadId
        });
      }).catch(() => null);
    } catch (cmdErr) {
      console.error(`[SELF-BOT] Blad komendy: ${commandName}`, cmdErr);
      await messageContext.reply({
        embeds: [errorEmbed('Blad komendy', 'Wystapil problem podczas wykonywania komendy.')]
      }).catch(() => null);
    }
  });
  mqttClient.on('error', (err) => {
    console.error('[SELF-BOT] Blad nasluchiwania MQTT:', err);
  });
}).catch(err => {
  console.error('[SELF-BOT] Logowanie nie powiodlo sie po probie z zapasowymi cookies:', err);
  process.exit(1);
});

// Serwer HTTP: panel administratora (apka/), health check (Railway) i pobieranie kopii
const PORT = process.env.PORT || 8080;
const panelApp = require('./apka/server.js');

panelApp.get('/backup', (req, res) => {
  const key = req.query.key;
  if (global.backupKey && key === global.backupKey && global.latestBackup) {
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="backup_database.json"'
    });
    res.send(global.latestBackup);
  } else {
    res.status(403).type('text/plain').send('Forbidden: Błędny lub przestarzały klucz kopii zapasowej.');
  }
});

panelApp.get('/interactions', (req, res) => {
  const key = req.query.key;
  if (global.interactionsKey && key === global.interactionsKey && global.latestInteractions) {
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="interactions.json"'
    });
    res.send(global.latestInteractions);
  } else {
    res.status(403).type('text/plain').send('Forbidden: Błędny lub przestarzały klucz eksportu interakcji.');
  }
});

panelApp.get('/health', (req, res) => {
  res.type('text/plain').send('Messenger casino self-bot is running.');
});

panelApp.listen(PORT, '0.0.0.0', () => {
  console.log(`[SELF-BOT] Serwer HTTP (panel administratora + health check) nasłuchuje na porcie ${PORT}`);
});
