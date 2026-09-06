const fs = require('fs');
const path = require('path');

const HISTORY_FILE = 'C:\\Users\\dupek\\Downloads\\file-1788724193594';
const DATA_DIR = path.join(__dirname, '..', 'data');
const SEED_DIR = path.join(__dirname, '..', 'data_seed');
const BACKUP_DIR = 'C:\\Users\\dupek\\.gemini\\antigravity\\db_backups';

function loadJson(p) {
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (e) {
    console.error(`Błąd odczytu ${p}:`, e.message);
  }
  return {};
}

function saveJson(p, data) {
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[ZAPISANO] ${p} (${fs.statSync(p).size.toLocaleString()} bajtów)`);
  } catch (e) {
    console.error(`Błąd zapisu ${p}:`, e.message);
  }
}

function main() {
  console.log('[IMPORT] Wczytuję plik historii:', HISTORY_FILE);
  if (!fs.existsSync(HISTORY_FILE)) {
    console.error('[BŁĄD] Plik nie istnieje:', HISTORY_FILE);
    process.exit(1);
  }

  const msgs = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  msgs.sort((a, b) => (a.ts || 0) - (b.ts || 0));

  console.log(`[IMPORT] Przetwarzam ${msgs.length} wiadomości od ${msgs[0]?.date} do ${msgs[msgs.length - 1]?.date}...`);

  const usersParsed = {};
  const groupStatsParsed = {};
  const threadLastUser = {};

  for (const msg of msgs) {
    const tid = String(msg.threadId || '');
    const sid = String(msg.senderID || '');
    const body = String(msg.body || '');
    const ts = Number(msg.ts || 0);

    if (!tid) continue;

    if (!groupStatsParsed[tid]) {
      groupStatsParsed[tid] = {
        visibleMessages: 0,
        processedMessages: 0,
        commandsExecuted: 0,
        mentionsCount: 0,
        firstUse: ts || Date.now(),
        lastUpdated: ts || Date.now(),
        seenMessageIds: [],
        memberCount: 0,
        adminCount: 0,
        groupName: 'Grupa'
      };
    }
    const g = groupStatsParsed[tid];
    g.visibleMessages++;
    g.processedMessages++;
    if (ts && (!g.firstUse || ts < g.firstUse)) g.firstUse = ts;
    if (ts && ts > g.lastUpdated) g.lastUpdated = ts;
    if (msg.messageID) {
      g.seenMessageIds.push(msg.messageID);
      if (g.seenMessageIds.length > 2000) g.seenMessageIds.shift();
    }

    if (body) {
      const mentions = body.match(/@/g);
      if (mentions) g.mentionsCount += mentions.length;
    }

    if (!msg.isBotResponse && sid) {
      threadLastUser[tid] = sid;

      if (!usersParsed[sid]) {
        usersParsed[sid] = {
          id: sid,
          messageCount: 0,
          groupMessages: {},
          commandsUsed: 0,
          commandCounts: {},
          balance: null,
          bank: null,
          inventory: {},
          dailyStreak: null,
          lastDailyClaim: null,
          lastDailyAmount: null,
          level: null,
          xp: null,
          name: null
        };
      }
      const u = usersParsed[sid];
      u.messageCount++;
      u.groupMessages[tid] = (u.groupMessages[tid] || 0) + 1;

      if (body.startsWith('!')) {
        const tokens = body.slice(1).trim().split(/\s+/);
        const cmdName = (tokens.shift() || '').toLowerCase();
        if (cmdName) {
          u.commandsUsed++;
          u.commandCounts[cmdName] = (u.commandCounts[cmdName] || 0) + 1;
          g.commandsExecuted++;
        }
      }
    }

    if (msg.isBotResponse && threadLastUser[tid]) {
      const uid = threadLastUser[tid];
      if (!usersParsed[uid]) continue;
      const u = usersParsed[uid];

      // Saldo / Portfel / Bank
      if (body.includes('Saldo') || body.includes('Portfel:')) {
        const nameMatch = body.match(/Saldo\s*—\s*\*?([^\*\n]+)\*?/);
        if (nameMatch && nameMatch[1]) u.name = nameMatch[1].trim();

        const wm = body.match(/Portfel:\s*💰?\s*([\d\s,]+)/);
        const bm = body.match(/Bank:\s*💰?\s*([\d\s,]+)/);
        if (wm) u.balance = parseInt(wm[1].replace(/[^0-9]/g, ''), 10);
        if (bm) u.bank = parseInt(bm[1].replace(/[^0-9]/g, ''), 10);
      }

      // Ekwipunek / Inventory
      if (body.includes('Ekwipunek')) {
        const nameMatch = body.match(/Ekwipunek\s*—\s*\*?([^\*\n]+)\*?/);
        if (nameMatch && nameMatch[1]) u.name = nameMatch[1].trim();

        const lines = body.split('\n');
        for (const line of lines) {
          const m = line.match(/^(\d+)\.\s*(.+?)\s*x(\d+)/);
          if (m) {
            u.inventory[m[2].trim()] = parseInt(m[3], 10);
          }
        }
      }

      // Daily
      if (body.includes('Odebrano daily!')) {
        const am = body.match(/\+\s*💰?\s*([\d\s,]+)/);
        const dm = body.match(/Dzień:\s*(\d+)/);
        if (am) u.lastDailyAmount = parseInt(am[1].replace(/[^0-9]/g, ''), 10);
        if (dm) {
          u.dailyStreak = parseInt(dm[1], 10);
          u.lastDailyClaim = ts;
        }
      }

      // Level / XP
      if (body.includes('Poziom:')) {
        const lm = body.match(/Poziom:\s*\*?(\d+)\*?/);
        const xpm = body.match(/XP:\s*\*?([\d\s,]+)\s*\/\s*([\d\s,]+)\*?/);
        if (lm) u.level = parseInt(lm[1], 10);
        if (xpm) u.xp = parseInt(xpm[1].replace(/[^0-9]/g, ''), 10);
      }
    }
  }

  console.log(`[IMPORT] Odczytano dane z historii: ${Object.keys(usersParsed).length} użytkowników, ${Object.keys(groupStatsParsed).length} grup.`);

  // Wczytaj aktualną bazę danych
  const usersPath = path.join(DATA_DIR, 'users.json');
  const profilesPath = path.join(DATA_DIR, 'profiles.json');
  const inventoryPath = path.join(DATA_DIR, 'inventory.json');
  const groupStatsPath = path.join(DATA_DIR, 'groupStats.json');

  const currentUsers = loadJson(usersPath);
  const currentProfiles = loadJson(profilesPath);
  const currentInventory = loadJson(inventoryPath);
  const currentGroupStats = loadJson(groupStatsPath);

  let updatedUsersCount = 0;
  let updatedInvCount = 0;

  for (const [userId, parsed] of Object.entries(usersParsed)) {
    if (!currentUsers[userId]) {
      currentUsers[userId] = {
        balance: 5000,
        bank: 10000,
        level: 1,
        xp: 0,
        totalWon: 0,
        totalLost: 0,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        commandsUsed: 0,
        lastActiveThreadId: null,
        prestige: 0,
        bio: '',
        badges: [],
        marriedTo: null,
        dailyCooldown: 0,
        messageCount: 0,
        groupMessages: {},
        commandCounts: {},
        company: null,
        company2: null,
        defaultCity: null,
        openedPackagesToday: 0,
        lastPackageOpenDate: null,
        workLevel: 1,
        workBoostUntil: 0,
        workBoostPercent: 0,
        tempCooldownReductionUntil: 0,
        negativeSince: null,
        activeLoan: null,
        blacklistedForNegativeBalance: false,
        claimedMilestones: [],
        name: null,
        id: userId,
        lastWorkTime: 0
      };
    }

    const u = currentUsers[userId];

    if (parsed.balance !== null) u.balance = parsed.balance;
    if (parsed.bank !== null) u.bank = parsed.bank;
    if (parsed.level !== null) u.level = parsed.level;
    if (parsed.xp !== null) u.xp = parsed.xp;
    if (parsed.dailyStreak !== null) u.dailyStreak = parsed.dailyStreak;
    if (parsed.lastDailyClaim !== null) u.lastDailyClaim = parsed.lastDailyClaim;
    if (parsed.name) u.name = parsed.name;

    u.messageCount = Math.max(u.messageCount || 0, parsed.messageCount);
    u.commandsUsed = Math.max(u.commandsUsed || 0, parsed.commandsUsed);

    u.groupMessages = u.groupMessages || {};
    for (const [tid, cnt] of Object.entries(parsed.groupMessages)) {
      u.groupMessages[tid] = Math.max(u.groupMessages[tid] || 0, cnt);
    }

    u.commandCounts = u.commandCounts || {};
    for (const [cmd, cnt] of Object.entries(parsed.commandCounts)) {
      u.commandCounts[cmd] = Math.max(u.commandCounts[cmd] || 0, cnt);
    }

    if (parsed.lastDailyAmount !== null || parsed.dailyStreak !== null) {
      currentProfiles[userId] = currentProfiles[userId] || {};
      if (parsed.lastDailyAmount !== null) currentProfiles[userId].lastDailyAmount = parsed.lastDailyAmount;
      if (parsed.dailyStreak !== null) currentProfiles[userId].lastDailyDay = parsed.dailyStreak;
    }

    if (Object.keys(parsed.inventory).length > 0) {
      currentInventory[userId] = { ...(currentInventory[userId] || {}), ...parsed.inventory };
      updatedInvCount++;
    }

    updatedUsersCount++;
  }

  // Zaktualizuj groupStats
  for (const [tid, gParsed] of Object.entries(groupStatsParsed)) {
    const existing = currentGroupStats[tid] || {
      visibleMessages: 0,
      processedMessages: 0,
      commandsExecuted: 0,
      mentionsCount: 0,
      firstUse: gParsed.firstUse,
      lastUpdated: gParsed.lastUpdated,
      memberCount: 0,
      adminCount: 0,
      groupName: 'Grupa',
      seenMessageIds: []
    };

    currentGroupStats[tid] = {
      ...existing,
      visibleMessages: Math.max(existing.visibleMessages || 0, gParsed.visibleMessages),
      processedMessages: Math.max(existing.processedMessages || 0, gParsed.processedMessages),
      commandsExecuted: Math.max(existing.commandsExecuted || 0, gParsed.commandsExecuted),
      mentionsCount: Math.max(existing.mentionsCount || 0, gParsed.mentionsCount),
      firstUse: existing.firstUse || gParsed.firstUse,
      lastUpdated: Math.max(existing.lastUpdated || 0, gParsed.lastUpdated),
      seenMessageIds: Array.from(new Set([...(existing.seenMessageIds || []), ...gParsed.seenMessageIds])).slice(-2000)
    };
  }

  console.log(`[IMPORT] Zaktualizowano dane dla ${updatedUsersCount} graczy i ${updatedInvCount} ekwipunków.`);

  // Zapisz do DATA_DIR
  saveJson(usersPath, currentUsers);
  saveJson(profilesPath, currentProfiles);
  saveJson(inventoryPath, currentInventory);
  saveJson(groupStatsPath, currentGroupStats);

  // Zapisz do SEED_DIR
  saveJson(path.join(SEED_DIR, 'users.json'), currentUsers);
  saveJson(path.join(SEED_DIR, 'profiles.json'), currentProfiles);
  saveJson(path.join(SEED_DIR, 'inventory.json'), currentInventory);
  saveJson(path.join(SEED_DIR, 'groupStats.json'), currentGroupStats);

  // Zapisz do BACKUP_DIR jeśli istnieje
  if (fs.existsSync(BACKUP_DIR)) {
    saveJson(path.join(BACKUP_DIR, 'users.json'), currentUsers);
    saveJson(path.join(BACKUP_DIR, 'profiles.json'), currentProfiles);
    saveJson(path.join(BACKUP_DIR, 'inventory.json'), currentInventory);
    saveJson(path.join(BACKUP_DIR, 'groupStats.json'), currentGroupStats);
  }

  console.log('[IMPORT] Sukces! Dane graczy w lokalnej wersji bota zostały zastąpione i zaktualizowane.');
}

main();
