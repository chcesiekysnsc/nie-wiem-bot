const fs = require('fs');
const path = require('path');
const http = require('http');
const login = require('@dongdev/fca-unofficial');

// Auto-seed data directory if empty (used for migration/Railway Volume setup)
// Wyłączono synchronizację appstate - używamy hardcoded cookies
function ensureSeededData() {
  const dataDir = path.join(__dirname, 'data');
  const seedDir = path.join(__dirname, 'data_seed');
  
  // appstate jest hardcoded w kodzie, pomijamy synchronizację
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  if (fs.existsSync(seedDir)) {
    try {
      const seedFiles = fs.readdirSync(seedDir).filter(f => f.endsWith('.json'));
      for (const file of seedFiles) {
        const targetPath = path.join(dataDir, file);
        const targetExists = fs.existsSync(targetPath);
        let targetEmpty = true;
        if (targetExists) {
          const content = fs.readFileSync(targetPath, 'utf8').trim();
          if (content && content !== '[]' && content !== '{}') {
            targetEmpty = false;
          }
        }
        
        if (targetEmpty) {
          const seedPath = path.join(seedDir, file);
          console.log(`[SEED] Copying data seed file ${file} to data/`);
          fs.copyFileSync(seedPath, targetPath);
        }
      }
    } catch (err) {
      console.error('[SEED] Failed to seed data directory:', err);
    }
  }
}
ensureSeededData();

require('dotenv').config();

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const config = require('./config/config');
const { ensureDataFiles, withData, createUser, appendLog } = require('./utils/storage');
const { checkCooldown, checkSpam } = require('./utils/cooldowns');
const { errorEmbed } = require('./utils/embeds');
const { renderPayloadToText } = require('./utils/messenger');
const { formatCurrency, msToReadable } = require('./utils/economy');
const { extractTikTokLink, getTikTokVideoData, downloadFile } = require('./utils/tiktok');

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

function findClosestCommand(name, commands) {
  let best = null, bestDist = Infinity;
  const seen = new Set();
  for (const [key, cmd] of commands.entries()) {
    if (seen.has(cmd.name)) continue;
    seen.add(cmd.name);
    const dist = levenshtein(name, key);
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
  marriageRequests: new Map(),
  userNames: new Map(),
  resolvedUserNames: new Set(),
  lastLotteryDraw: 0,
  lastTaxCollection: 0,
  activeThreadIds: new Set(),
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
      return this.userNames.get(userId);
    }

    // Sprawdź najpierw w bazie danych, czy imię jest zapisane
    let dbName = null;
    try {
      const { loadData } = require('./utils/storage');
      const usersData = loadData('users');
      if (usersData && usersData[userId] && usersData[userId].name) {
        dbName = usersData[userId].name;
      }
    } catch (_) {}

    if (dbName) {
      this.userNames.set(userId, dbName);
      this.resolvedUserNames.add(userId);
      return dbName;
    }

    return new Promise((resolve) => {
      if (!api) {
        return resolve(this.userNames.get(userId) || `Użytkownik_${userId.slice(-6)}`);
      }
      api.getUserInfo(userId, (err, ret) => {
        if (!err && ret && ret[userId]) {
          const name = ret[userId].name;
          this.userNames.set(userId, name);
          this.resolvedUserNames.add(userId);
          
          // Zapisz asynchronicznie do bazy danych
          const { withData } = require('./utils/storage');
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

const activeThreadsPath = path.join(__dirname, 'data', 'active_threads.json');
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

const processedGroupsPath = path.join(__dirname, 'data', 'processed_groups.json');
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

// appstate.json nie jest już potrzebny — cookies wgrane na stałe w kodzie

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
          api.sendMessage(ann.msg, ann.threadId);
        } else {
          const targets = Array.from(client.activeThreadIds);
          if (targets.length > 0) {
            api.sendMessage(ann.msg, targets[0]);
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

// ===== HARDCODED APPSTATE (cookies wgrane na stałe) =====

const appState = [
    {
        "key": "dbln",
        "value": "%7B%2261562475523609%22%3A%22AX6WwYPo%22%7D",
        "domain": "facebook.com",
        "path": "/login/device-based/",
        "hostOnly": false,
        "creation": "2026-07-02T23:09:37.251Z",
        "lastAccessed": "2026-07-02T23:09:37.251Z"
    },
    {
        "key": "sb",
        "value": "oZ-mZmUkSi-ORxWZSYx0LUyc",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-02T23:09:37.252Z",
        "lastAccessed": "2026-07-02T23:09:37.252Z"
    },
    {
        "key": "oo",
        "value": "v1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-02T23:09:37.252Z",
        "lastAccessed": "2026-07-02T23:09:37.252Z"
    },
    {
        "key": "datr",
        "value": "vWo9aRvRclEH-d95BN9Q5ptx",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-02T23:09:37.252Z",
        "lastAccessed": "2026-07-02T23:09:37.252Z"
    },
    {
        "key": "wd",
        "value": "1366x641",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-02T23:09:37.252Z",
        "lastAccessed": "2026-07-02T23:09:37.252Z"
    },
    {
        "key": "ps_l",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-02T23:09:37.252Z",
        "lastAccessed": "2026-07-02T23:09:37.252Z"
    },
    {
        "key": "ps_n",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-02T23:09:37.252Z",
        "lastAccessed": "2026-07-02T23:09:37.252Z"
    },
    {
        "key": "c_user",
        "value": "61560227271099",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-02T23:09:37.252Z",
        "lastAccessed": "2026-07-02T23:09:37.252Z"
    },
    {
        "key": "fr",
        "value": "0nVneawTlAFbel8Tt.AWfbCVQ548y9Q4h9p2BpG8nzn5vIZy5SaGKZI6d3XvLHO5ygQk0.BqRu-r..AAA.0.0.BqRu-r.AWfJ_IO1Ci7bZpeG-JsTtKDWgtM",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-02T23:09:37.252Z",
        "lastAccessed": "2026-07-02T23:09:37.252Z"
    },
    {
        "key": "xs",
        "value": "44%3ASTDwv3Bc2Xcnow%3A2%3A1783033768%3A-1%3A-1%3A%3AAcyzsNLO5MViU7o0LmSXhVVJFX-TehPQo4pe_C6WPg",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-02T23:09:37.252Z",
        "lastAccessed": "2026-07-02T23:09:37.252Z"
    }
];

// ===== KONIEC HARDCODED APPSTATE =====

console.log('[SELF-BOT] Logowanie do Messengera za pomoca appstate.json...');

login({ appState }, (loginErr, api) => {
  if (loginErr) {
    console.error('[SELF-BOT] Logowanie nie powiodlo sie:', loginErr);
    process.exit(1);
  }

  client.api = api;

  console.log('[SELF-BOT] Zalogowano pomyslnie! Rozpoczynanie nasluchiwania wiadomosci...');
  
  // Dodaj konto bota do grona administratorów (podadmina)
  const botId = typeof api.getCurrentUserID === 'function' ? api.getCurrentUserID() : '';
  if (botId && !config.admins.includes(botId)) {
    config.admins.push(botId);
    console.log(`[SELF-BOT] Dodano konto bota (${botId}) do grona administratorów.`);
  }

  // Odzyskiwanie przerwanych zakładów meczowych/multi-meczowych po restarcie
  const { resolvePendingBets } = require('./utils/bets');
  setTimeout(() => {
    resolvePendingBets(api).catch(err => {
      console.error('[SELF-BOT] Blad podczas odzyskiwania zakladow:', err);
    });
  }, 3000);

  // Pętla panelu administratora: heartbeat statusu + obsługa ogłoszeń i restartu z panelu (apka/)
  setInterval(() => {
    withData(store => {
      store.profiles.botStatus = {
        loggedIn: !!client.api,
        botId: botId || null,
        activeThreads: client.activeThreadIds.size,
        lastHeartbeat: Date.now()
      };
      const broadcasts = Array.isArray(store.profiles.pendingAdminBroadcasts) ? store.profiles.pendingAdminBroadcasts : [];
      store.profiles.pendingAdminBroadcasts = [];
      const restart = store.profiles.pendingAdminRestart === true;
      store.profiles.pendingAdminRestart = false;
      return { broadcasts, restart };
    }).then(({ broadcasts, restart }) => {
      for (const b of broadcasts) {
        const msg = `📢 **OGŁOSZENIE ADMINISTRACJI:**\n\n${b.message}`;
        for (const t of Array.from(client.activeThreadIds)) {
          try { api.sendMessage(msg, t); } catch (err) {
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

  // Wrap api.sendMessage to send messages instantly without delay (cooldown removed)
  const originalSendMessage = api.sendMessage;
  api.sendMessage = function(message, threadID, callback, messageID) {
    if (client.api && !client.sendingLoanNotifications) {
      client.sendingLoanNotifications = true;
      sendPendingLoanNotifications(client.api).finally(() => {
        client.sendingLoanNotifications = false;
      });
    }
    return originalSendMessage.call(api, message, threadID, callback, messageID);
  };

  client.api = api;
  client.lastLotteryDraw = Date.now();

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
          let totalTickets = 0;

          for (const [userId, inv] of Object.entries(store.inventory || {})) {
            const ticketCount = inv.ticket || 0;
            if (ticketCount > 0) {
              totalTickets += ticketCount;
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
          winnerUser.balance = (winnerUser.balance || 0) + totalPrize;

          for (const inv of Object.values(store.inventory || {})) {
            if (inv.ticket) {
              inv.ticket = 0;
            }
          }

          return {
            winnerId,
            totalTickets,
            totalPrize
          };
        });

        if (drawResult) {
          client.lastLotteryDraw = Date.now();
          const winnerName = await client.resolveUserName(client.api, drawResult.winnerId);
          const announceMsg = 
            `🎟️ **LOSOWANIE LOTERII**\n` +
            `Łączna liczba biletów w grze: **${drawResult.totalTickets}**\n` +
            `Wygrywa: **${winnerName}**! 🎉\n` +
            `Nagroda główna: **+${drawResult.totalPrize.toLocaleString()} viccoinów** została dodana do portfela!\n` +
            `Wszystkie bilety zostały zresetowane. Kup nowe w sklepie za pomocą \`!sklep 4\`.`;

          const targets = Array.from(client.activeThreadIds);
          if (targets.length > 0) {
            for (const tId of targets) {
              client.api.sendMessage(announceMsg, tId);
            }
          } else if (client.lastThreadId) {
            client.api.sendMessage(announceMsg, client.lastThreadId);
          }
        }
      } catch (err) {
        console.error('[LOTTERY] Blad podczas losowania loterii:', err);
      }

      // Rekurencyjnie uruchamiaj timer od nowa (zawsze licząc od ostatniego losowania)
      startLotteryTimer();
    }, 10 * 60 * 1000); // 10 minut
  }

  // Uruchom timer loterii
  startLotteryTimer();

  // System podatków co 12 godzin (zawsze o północy i w południe)
  function startTaxCollection() {
    const delay = getMsUntilNextTaxTime() + 2000;
    setTimeout(async () => {
      try {
        const result = await withData(store => {
          let totalCollected = 0;
          const taxedUsers = [];

          for (const [userId, user] of Object.entries(store.users || {})) {
            if (user.balance > 0) {
              const tax = Math.floor(user.balance * 0.04);
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
            `Łączna kwota podatku: **${result.totalCollected.toLocaleString()} viccoinów**`;

          const targets = Array.from(client.activeThreadIds);
          if (targets.length > 0) {
            for (const tId of targets) {
              client.api.sendMessage(announceMsg, tId);
            }
          } else if (client.lastThreadId) {
            client.api.sendMessage(announceMsg, client.lastThreadId);
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
      }

      // Rekurencyjnie uruchamiaj timer od nowa
      startTaxCollection();
    }, delay);
  }

  // Inicjalizuj ostatni pobór podatków i uruchom timer
  client.lastTaxCollection = getLastTaxTime();
  client.getMsUntilNextTaxTime = getMsUntilNextTaxTime;
  startTaxCollection();

  // System automatycznego resetu ekonomii co miesiąc o 00:00 czasu polskiego
  async function checkAndAnnounceMonthlyReset() {
    try {
      let resetTriggered = false;
      let winners = [];

      await withData(store => {
        if (store.profiles.justReset) {
          resetTriggered = true;
          winners = store.profiles.lastResetWinners || [];
          store.profiles.justReset = false;
        }
      });

      if (resetTriggered && client.api) {
        console.log('[MONTHLY RESET] Detected justReset flag. Broadcasting announcement...');
        const eventItems = {
          'szkarlatne_oko': { emoji: '👁️', name: 'Szkarłatne Oko Krupiera' },
          'cien_nocy': { emoji: '🥷', name: 'Cień Nocy' },
          'wampirzy_sztylet': { emoji: '🩸', name: 'Wampirzy Sztylet' },
          'szwajcarski_klucz': { emoji: '🔑', name: 'Szwajcarski Klucz' },
          'krysztal_doswiadczenia': { emoji: '🔮', name: 'Kryształ Doświadczenia' },
          'ananas_na_pizzy': { emoji: '🍕', name: 'Ananas na Pizzy' },
          'czarna_bandera': { emoji: '🏴', name: 'Czarna Bandera' },
          'czarna_karta': { emoji: '💳', name: 'Czarna Karta Bankowa' },
          'kosci_oszusta': { emoji: '🎲', name: 'Kości Oszusta' },
          'czterolistna_moneta': { emoji: '🍀', name: 'Czterolistna Moneta' }
        };

        let winnerLines = [];
        for (let i = 0; i < winners.length; i++) {
          const w = winners[i];
          const name = await client.resolveUserName(client.api, w.userId);
          const item = eventItems[w.item] || { emoji: '🎁', name: w.item };
          winnerLines.push(`${i + 1}. 👤 **${name}** (Majątek: **${(w.total || 0).toLocaleString()}**) — Otrzymuje: ${item.emoji} **${item.name}**`);
        }

        const announceMsg = 
          `🎉 📅 **ROZPOCZĄŁ SIĘ NOWY MIESIĄC - WIELKI RESET EKONOMII** 📅 🎉\n\n` +
          `Wszystkie portfele, banki i gangi zostały zresetowane do wartości początkowych!\n\n` +
          `🏆 **Zwycięzcy Sezonu (Top 5 Graczy bez multikont):**\n` +
          (winnerLines.length > 0 ? winnerLines.join('\n') : 'Brak kwalifikujących się graczy.') + `\n\n` +
          `💪 Czas na nowy sezon! Powodzenia w zdobywaniu kolejnych szczytów ekonomii!`;

        const targets = Array.from(client.activeThreadIds);
        if (targets.length > 0) {
          for (const tId of targets) {
            client.api.sendMessage(announceMsg, tId);
          }
        } else if (client.lastThreadId) {
          client.api.sendMessage(announceMsg, client.lastThreadId);
        }
      }
    } catch (err) {
      console.error('[MONTHLY RESET] Błąd podczas sprawdzania/ogłaszania resetu:', err);
    }
  }

  function startMonthlyResetTimer() {
    const delay = getMsUntilNextMonthlyReset() + 2000;
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
            client.api.getThreadInfo(threadId, async (err, info) => {
              if (err || !info || !info.participantIDs || info.participantIDs.length === 0) return;
              
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
                  body: `⚠️ **PRZYPOMNIENIE O POŻYCZCE** ⚠️\nNastępujące osoby mają aktywną pożyczkę do spłaty:\n\n${lines}\n\n👉 Spłać komendą: \`!pozyczka splac <kwota|all>\``,
                  mentions: tagMentions
                };
                
                client.api.sendMessage(remindMsg, threadId);
              }
            });
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

            const announceMsg = `⚡ **SZYBKIE PALCE** ⚡\nKto pierwszy przepisze poniższy kod, wygrywa **💰 ${prize.toLocaleString()}**!\n\n👉 **\`${code}\`**`;
            
            client.api.sendMessage(announceMsg, threadId);

            // Auto-cleanup po 2 minutach
            setTimeout(() => {
              const game = client.activeReactions.get(threadId);
              if (game && game.code === code && game.active) {
                client.activeReactions.delete(threadId);
                client.api.sendMessage(`⌛ **SZYBKIE PALCE** ⌛\nCzas minął! Nikt nie przepisał kodu **\`${code}\`** na czas.`, threadId);
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
          const flagsList = flagaCmd.flagsList;

          for (const threadId of targets) {
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

            const announceMsg = `🏳️ **ZGADNIJ KRAJ** 🏳️\nJaki kraj reprezentuje ta flaga?\n\n👉 **${randomFlag.emoji}**\n\n💰 Nagroda: **💰 ${prize.toLocaleString()}**!\n⏱️ Masz ${time} sekund na odpowiedź.`;
            client.api.sendMessage(announceMsg, threadId);

            // Auto-cleanup po określonym czasie
            setTimeout(() => {
              const game = client.activeFlags.get(threadId);
              if (game && game.emoji === randomFlag.emoji && game.active) {
                client.activeFlags.delete(threadId);
                client.api.sendMessage(`⌛ **ZGADNIJ KRAJ** ⌛\nCzas minął! Nikt nie zgadł flagi **${randomFlag.emoji}** (${randomFlag.name}) na czas.`, threadId);
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
    const welcomeMsg = "dziekuje za dodanie na grupe, moj prefix to ! po wiecej informacji wpisz !help";
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

  api.listenMqtt(async (err, event) => {
    if (err) {
      console.error('[SELF-BOT] Blad nasluchiwania (wymuszenie restartu):', err);
      process.exit(1);
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
    const isUnsubscribeEvent = (event.type === 'event' && event.logMessageType === 'log:unsubscribe') || (event.type === 'log:unsubscribe');
    if (isUnsubscribeEvent) {
      const threadId = event.threadID;
      
      // Wyciągamy ID usuniętych/wychodzących użytkowników
      const removedUsers = [];
      
      // Jeśli użytkownik wyszedł dobrowolnie (leftParticipantFbId)
      if (event.logMessageData?.leftParticipantFbId) {
        removedUsers.push(String(event.logMessageData.leftParticipantFbId));
      }
      
      // Jeśli użytkownik został usunięty/wyrzucony (removedParticipants)
      const dataParticipants = event.logMessageData?.removedParticipants;
      if (Array.isArray(dataParticipants)) {
        for (const p of dataParticipants) {
          if (p && typeof p === 'object') {
            const uid = p.userFbId || p.userID || p.id;
            if (uid) removedUsers.push(String(uid));
          } else if (p) {
            removedUsers.push(String(p));
          }
        }
      }
      
      // Fallbacki dla innych wersji FCA/Messenger
      if (event.participantID) {
        removedUsers.push(String(event.participantID));
      }
      if (event.targetID) {
        removedUsers.push(String(event.targetID));
      }

      const uniqueRemoved = [...new Set(removedUsers)];

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
            const getThreadInfo = () => {
              return new Promise((resolve, reject) => {
                api.getThreadInfo(threadId, (err, info) => {
                  if (err) return reject(err);
                  resolve(info);
                });
              });
            };

            const threadInfo = await getThreadInfo();
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
        await withData(store => {
          if (store.profiles.threadSettings && store.profiles.threadSettings[threadId] && store.profiles.threadSettings[threadId].loopUsers) {
            loopUsers = [...store.profiles.threadSettings[threadId].loopUsers];
          }
        });

        if (loopUsers.length > 0) {
          for (const userId of uniqueRemoved) {
            if (loopUsers.includes(userId)) {
              console.log(`[LOOP] Wykryto wyjście/wyrzucenie zapętlonego użytkownika ${userId} z wątku ${threadId}. Dodawanie z powrotem...`);
              api.addUserToGroup(userId, threadId, (err) => {
                if (err) {
                  console.error(`[LOOP ERROR] Nie udało się dodać użytkownika ${userId} z powrotem:`, err);
                } else {
                  console.log(`[LOOP] Pomyślnie dodano użytkownika ${userId} z powrotem do grupy ${threadId}.`);
                  api.sendMessage(`🔁 **Zapętlony użytkownik został dodany z powrotem do grupy.**`, threadId);

                  // Sprawdź, czy użytkownik ma zablokowany pseudonim (guardnick) i go przywróć
                  (async () => {
                    let guardNickname = null;
                    await withData(store => {
                      if (store.profiles.threadSettings && store.profiles.threadSettings[threadId]) {
                        const settings = store.profiles.threadSettings[threadId];
                        if (settings.nicknameGuards && settings.nicknameGuards[userId]) {
                          guardNickname = settings.nicknameGuards[userId];
                        } else if (settings.nicknameGuard && String(settings.nicknameGuard.userId) === String(userId)) {
                          guardNickname = settings.nicknameGuard.nickname;
                        }
                      }
                    });

                    if (guardNickname) {
                      console.log(`[LOOP] Przywracanie zablokowanego pseudonimu "${guardNickname}" po powrocie dla ${userId}...`);
                      setTimeout(() => {
                        api.changeNickname(guardNickname, threadId, userId, (nickErr) => {
                          if (nickErr) {
                            console.error('[LOOP NICKNAME RESTORE ERROR]', nickErr);
                          } else {
                            console.log(`[LOOP] Pomyślnie przywrócono zablokowany pseudonim "${guardNickname}" dla ${userId}.`);
                          }
                        });
                      }, 1500).unref();
                    }
                  })();
                }
              });
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
        api.getThreadInfo(threadId, (infoErr, info) => {
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
        const fs = require('fs');
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

        // Sprawdź, czy nadawca jest podadminem bota
        const isSubAdmin = config.admins.includes(cached.senderID);

        // Sprawdź ustawienia grupy w bazie danych
        const isLoggingEnabled = await withData(store => {
          const settings = store.profiles.threadSettings && store.profiles.threadSettings[event.threadID];
          return settings ? settings.unsendLoggingEnabled !== false : true; // domyślnie włączone
        });

        // Logujemy jeśli włączone lub jeśli nadawca jest podadminem (zawsze)
        if (isLoggingEnabled || isSubAdmin) {
          try {
            const senderName = await client.resolveUserName(api, cached.senderID);
            let announceMsg = `🗑️ **Użytkownik ${senderName} usunął wiadomość:**\n"${cached.body}"`;
            
            if (cached.attachmentUrls && cached.attachmentUrls.length > 0) {
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
    }

    if (!['message', 'message_reply'].includes(event.type) || !event.body) {
      return;
    }

    const senderId = event.senderID;
    const threadId = event.threadID;
    const isGroup = threadId && threadId !== senderId;

    // Na czatach prywatnych (PV/DM) bot odpowiada wyłącznie twórcy (100060812419294)
    if (!isGroup && senderId !== '100060812419294') {
      return;
    }

    console.log(`[MQTT-MSG] Message received in thread ${threadId} from sender ${senderId}: "${event.body}"`);

    const text = event.body.trim();
    const messageId = event.messageID;

    // Odczytaj prefix dla danej grupy z bazy danych
    let currentPrefix = client.config.prefix;
    if (threadId) {
      await withData(store => {
        if (store.profiles.threadSettings && store.profiles.threadSettings[threadId] && store.profiles.threadSettings[threadId].prefix) {
          currentPrefix = store.profiles.threadSettings[threadId].prefix;
        }
      });
    }

    // Obsługa sytuacji, gdy treść wiadomości to dokładnie sam prefix (np. !)
    if (text === currentPrefix) {
      api.sendMessage(`💡 Aby zobaczyć listę komend, proszę napisać: **${currentPrefix}help**`, threadId, () => {}, messageId);
      return;
    }

    // Ignoruj własne wiadomości bota, jeśli nie zaczynają się od prefixu komendy (zapobieganie pętlom)
    const botId = typeof api.getCurrentUserID === 'function' ? api.getCurrentUserID() : '';
    if (botId && String(senderId) === String(botId) && !text.startsWith(currentPrefix)) {
      console.log(`[MQTT-MSG] Ignored self-message without command prefix: "${text}"`);
      return;
    }

    // Automatyczny pobieracz wideo z TikToka
    const tiktokLink = extractTikTokLink(text);
    if (tiktokLink && !text.startsWith(currentPrefix)) {
      console.log(`[TIKTOK] Wykryto link do TikToka od ${senderId} w wątku ${threadId}: ${tiktokLink}`);
      api.setMessageReaction('⏳', messageId, () => {});

      (async () => {
        const tempFile = path.join(__dirname, 'data', `tiktok_${messageId}.mp4`);
        try {
          const data = await getTikTokVideoData(tiktokLink);
          const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

          if (data.size > MAX_SIZE) {
            console.log(`[TIKTOK] Film jest zbyt duży (${(data.size / 1024 / 1024).toFixed(2)} MB). Wysyłam link bezpośredni.`);
            api.sendMessage(
              `⚠️ **Wideo jest zbyt duże (${(data.size / 1024 / 1024).toFixed(2)} MB), aby wysłać je bezpośrednio.**\n\n` +
              `👤 Autor: @${data.author}\n` +
              `📝 Tytuł: ${data.title}\n\n` +
              `👀 ${data.views.toLocaleString()} | ❤️ ${data.likes.toLocaleString()} | 💬 ${data.comments.toLocaleString()} | 🔁 ${data.shares.toLocaleString()}\n\n` +
              `🔗 Link bez znaku wodnego:\n${data.playUrl}`,
              threadId,
              (err) => {
                if (err) console.error('[TIKTOK SEND MSG ERROR]', err);
                api.setMessageReaction('❌', messageId, () => {});
              },
              messageId
            );
            return;
          }

          console.log(`[TIKTOK] Pobieranie wideo (${(data.size / 1024 / 1024).toFixed(2)} MB) do: ${tempFile}`);
          await downloadFile(data.playUrl, tempFile);

          console.log(`[TIKTOK] Wysyłanie wideo do wątku ${threadId}...`);
          api.sendMessage({
            body: `🎥 **TikTok od @${data.author}**\n` +
                  `${data.title}\n\n` +
                  `👀 ${data.views.toLocaleString()} | ❤️ ${data.likes.toLocaleString()} | 💬 ${data.comments.toLocaleString()} | 🔁 ${data.shares.toLocaleString()}`,
            attachment: fs.createReadStream(tempFile)
          }, threadId, (err) => {
            if (err) {
              console.error('[TIKTOK SEND VIDEO ERROR]', err);
              api.setMessageReaction('❌', messageId, () => {});
              api.sendMessage(`❌ Nie udało się wysłać pobranego wideo.`, threadId, () => {}, messageId);
            } else {
              api.setMessageReaction('✅', messageId, () => {});
            }
          }, messageId);

        } catch (err) {
          console.error('[TIKTOK ERROR]', err.message);
          api.setMessageReaction('❌', messageId, () => {});
          api.sendMessage(`❌ Nie udało się pobrać wideo z TikToka.`, threadId, () => {}, messageId);
        } finally {
          // Czyszczenie pliku tymczasowego (poczekaj 5s, by upewnić się, że strumień FB został zamknięty)
          setTimeout(() => {
            if (fs.existsSync(tempFile)) {
              try {
                fs.unlinkSync(tempFile);
                console.log(`[TIKTOK] Wyczyszczono plik tymczasowy: ${tempFile}`);
              } catch (e) {
                console.error('[TIKTOK CLEANUP ERROR]', e.message);
              }
            }
          }, 5000).unref();
        }
      })();
    }

    // Odczytaj wiadomosc po losowym czasie (500ms - 1200ms)
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

    // Interceptor dla potwierdzeń (np. !afkdel ok/stop)
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
          return; // Zakończ przetwarzanie, nie traktuj jako komendy
        }
      }
    }

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

      if (isGroup || shouldUpdateUser) {
        await withData(store => {
          if (shouldUpdateUser) {
            const u = createUser(senderId, store.users);
            u.messageCount = (u.messageCount || 0) + 1;
            u.lastActiveTime = Date.now();
            if (isGroup) {
              u.groupMessages = u.groupMessages || {};
              u.groupMessages[threadId] = (u.groupMessages[threadId] || 0) + 1;
            }
          }

          if (isGroup) {
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
          }
        });
      }
    } else {
      // Aktualizacja statystyk dla komend
      if (isGroup) {
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
    }

    if (threadId && isGroup) {
      if (!client.activeThreadIds.has(threadId)) {
        client.activeThreadIds.add(threadId);
        try {
          fs.writeFileSync(activeThreadsPath, JSON.stringify(Array.from(client.activeThreadIds), null, 2), 'utf8');
        } catch (e) {
          console.error('[SELF-BOT] Failed to save active threads:', e);
        }
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

    // Interceptor dla Zgadnij Kraj (flagi)
    if (client.activeFlags) {
      const flagGame = client.activeFlags.get(threadId);
      if (flagGame && flagGame.active) {
        const normalizedInput = normalizeText(text);
        const isCorrect = flagGame.answers.some(ans => normalizeText(ans) === normalizedInput);

        if (isCorrect) {
          flagGame.active = false;
          client.activeFlags.delete(threadId);

          const prize = flagGame.prize;
          const winnerId = senderId;
          const winnerName = await client.resolveUserName(api, winnerId);

          await withData(store => {
            const u = createUser(winnerId, store.users);
            u.balance = (u.balance || 0) + prize;
          });

          const replyMsg = `🎉 **ZGADNIJ KRAJ** 🎉\nGratulacje **${winnerName}**! Poprawna odpowiedź to **${flagGame.countryName}**! Wygrywasz **+💰 ${prize.toLocaleString()}**!`;
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
    if (activeGame && activeGame.threadId === threadId) {
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
    // Blacklist checks disabled per user requirements
    const isUserBlacklisted = false;
    const isGroupBlacklisted = false;
    const blacklist = [];
    const trueBlacklist = [];

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
      
      let hasBlacklistedTarget = false; // Blacklist checks disabled
    }
    if (!command) {
      const normInput = normalizeText(commandName);
      let bestDist = Infinity;
      let suggestion = null;
      const seen = new Set();
      for (const [key, cmd] of client.commands.entries()) {
        if (seen.has(cmd.name)) continue;
        seen.add(cmd.name);
        const dist = levenshtein(normInput, normalizeText(key));
        if (dist < bestDist) {
          bestDist = dist;
          suggestion = cmd.name;
        }
      }

      const closest = bestDist <= 2 ? suggestion : null;
      const msg = closest
        ? `Nie znaleziono komendy "${currentPrefix}${commandName}". Czy chodzilo Ci o ${currentPrefix}${closest}?`
        : `Nie znaleziono komendy "${currentPrefix}${commandName}". Wpisz ${currentPrefix}help, aby zobaczyc liste komend.`;
      api.sendMessage(msg, threadId, () => {}, messageId);
      return;
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
          const { addXp, ensureInventoryRecord, getMilestoneRewardDescription } = require('./utils/economy');
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
      let cooldownState = { active: false };
      if (!isBribe) {
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

      await command.execute(client, messageContext, args);

      withData(store => {
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

panelApp.get('/health', (req, res) => {
  res.type('text/plain').send('Messenger casino self-bot is running.');
});

panelApp.listen(PORT, '0.0.0.0', () => {
  console.log(`[SELF-BOT] Serwer HTTP (panel administratora + health check) nasłuchuje na porcie ${PORT}`);
});
