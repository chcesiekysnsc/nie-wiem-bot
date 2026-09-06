const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const HISTORY_FILE = 'C:\\Users\\dupek\\Downloads\\file-1788724193594';
const DATA_DIR = path.join(__dirname, '..', 'data');
const SEED_DIR = path.join(__dirname, '..', 'data_seed');
const BACKUP_DIR = 'C:\\Users\\dupek\\.gemini\\antigravity\\db_backups';

function saveJson(p, data) {
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[ZAPISANO BEZBEZPOŚREDNIO] ${p} (${fs.statSync(p).size.toLocaleString()} bajtów)`);
  } catch (e) {
    console.error(`Błąd zapisu ${p}:`, e.message);
  }
}

function loadGitJson(gitRefPath) {
  try {
    const raw = cp.execSync(`git show ${gitRefPath}`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Błąd odczytu git ${gitRefPath}:`, e.message);
    return {};
  }
}

function main() {
  console.log('[STRICT-OVERRIDE] Wczytuję plik historii:', HISTORY_FILE);
  if (!fs.existsSync(HISTORY_FILE)) {
    console.error('[BŁĄD] Plik historii nie istnieje:', HISTORY_FILE);
    process.exit(1);
  }

  const msgs = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  msgs.sort((a, b) => (a.ts || 0) - (b.ts || 0));

  console.log(`[STRICT-OVERRIDE] Przetwarzam ${msgs.length} wiadomości z pliku historii...`);

  // Wczytanie starej bazy z git commit c6d3cc5 dla nieaktywnych użytkowników
  const oldUsers = loadGitJson('c6d3cc5:data_seed/users.json');
  const oldProfiles = loadGitJson('c6d3cc5:data_seed/profiles.json');
  const oldGroupStats = loadGitJson('c6d3cc5:data_seed/groupStats.json');

  const historyUsers = {};
  const historyInventory = {};
  const historyProfiles = {};
  const historyGroupStats = {};
  const threadLastUser = {};

  for (const msg of msgs) {
    const tid = String(msg.threadId || '');
    const sid = String(msg.senderID || '');
    const body = String(msg.body || '');
    const ts = Number(msg.ts || 0);

    if (!tid) continue;

    if (!historyGroupStats[tid]) {
      historyGroupStats[tid] = {
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
    const g = historyGroupStats[tid];
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

      if (!historyUsers[sid]) {
        historyUsers[sid] = {
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
      const u = historyUsers[sid];
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
      if (!historyUsers[uid]) continue;
      const u = historyUsers[uid];

      if (body.includes('Saldo') || body.includes('Portfel:')) {
        const nameMatch = body.match(/Saldo\s*—\s*\*?([^\*\n]+)\*?/);
        if (nameMatch && nameMatch[1]) u.name = nameMatch[1].trim();

        const wm = body.match(/Portfel:\s*💰?\s*([\d\s,]+)/);
        const bm = body.match(/Bank:\s*💰?\s*([\d\s,]+)/);
        if (wm) u.balance = parseInt(wm[1].replace(/[^0-9]/g, ''), 10);
        if (bm) u.bank = parseInt(bm[1].replace(/[^0-9]/g, ''), 10);
      }

      if (body.includes('Ekwipunek')) {
        const nameMatch = body.match(/Ekwipunek\s*—\s*\*?([^\*\n]+)\*?/);
        if (nameMatch && nameMatch[1]) u.name = nameMatch[1].trim();

        const items = {};
        const lines = body.split('\n');
        for (const line of lines) {
          const m = line.match(/^(\d+)\.\s*(.+?)\s*x(\d+)/);
          if (m) {
            items[m[2].trim()] = parseInt(m[3], 10);
          }
        }
        historyInventory[uid] = items;
      }

      if (body.includes('Odebrano daily!')) {
        const am = body.match(/\+\s*💰?\s*([\d\s,]+)/);
        const dm = body.match(/Dzień:\s*(\d+)/);
        if (am) {
          const amt = parseInt(am[1].replace(/[^0-9]/g, ''), 10);
          historyProfiles[uid] = historyProfiles[uid] || {};
          historyProfiles[uid].lastDailyAmount = amt;
        }
        if (dm) {
          const day = parseInt(dm[1], 10);
          u.dailyStreak = day;
          u.lastDailyClaim = ts;
          historyProfiles[uid] = historyProfiles[uid] || {};
          historyProfiles[uid].lastDailyDay = day;
        }
      }

      if (body.includes('Poziom:')) {
        const lm = body.match(/Poziom:\s*\*?(\d+)\*?/);
        const xpm = body.match(/XP:\s*\*?([\d\s,]+)\s*\/\s*([\d\s,]+)\*?/);
        if (lm) u.level = parseInt(lm[1], 10);
        if (xpm) u.xp = parseInt(xpm[1].replace(/[^0-9]/g, ''), 10);
      }
    }
  }

  const mergedUsers = {};
  const mergedInventory = {};
  const mergedProfiles = { ...oldProfiles, ...historyProfiles };
  const mergedGroupStats = { ...oldGroupStats };

  for (const [tid, gData] of Object.entries(historyGroupStats)) {
    const existing = mergedGroupStats[tid] || {
      visibleMessages: 0,
      processedMessages: 0,
      commandsExecuted: 0,
      mentionsCount: 0,
      firstUse: gData.firstUse,
      lastUpdated: gData.lastUpdated,
      memberCount: 0,
      adminCount: 0,
      groupName: 'Grupa',
      seenMessageIds: []
    };

    mergedGroupStats[tid] = {
      ...existing,
      visibleMessages: Math.max(existing.visibleMessages || 0, gData.visibleMessages),
      processedMessages: Math.max(existing.processedMessages || 0, gData.processedMessages),
      commandsExecuted: Math.max(existing.commandsExecuted || 0, gData.commandsExecuted),
      mentionsCount: Math.max(existing.mentionsCount || 0, gData.mentionsCount),
      firstUse: existing.firstUse || gData.firstUse,
      lastUpdated: Math.max(existing.lastUpdated || 0, gData.lastUpdated),
      seenMessageIds: Array.from(new Set([...(existing.seenMessageIds || []), ...gData.seenMessageIds])).slice(-2000)
    };
  }

  const allUserIds = new Set([
    ...Object.keys(oldUsers),
    ...Object.keys(historyUsers)
  ]);

  let countStrictlyOverwritten = 0;
  let countResetEconomyOnly = 0;

  for (const userId of allUserIds) {
    const inHist = historyUsers[userId];
    const oldU = oldUsers[userId] || {};

    if (inHist) {
      countStrictlyOverwritten++;
      // USUWAMY dane lokalne i podstawiamy 1:1 DANE Z PLIKU HISTORII
      mergedUsers[userId] = {
        balance: inHist.balance !== null ? inHist.balance : 5000,
        bank: inHist.bank !== null ? inHist.bank : 10000,
        level: inHist.level !== null ? inHist.level : 1,
        xp: inHist.xp !== null ? inHist.xp : 0,
        totalWon: 0,
        totalLost: 0,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        commandsUsed: inHist.commandsUsed || 0,
        lastActiveThreadId: null,
        prestige: 0,
        bio: '',
        badges: [],
        marriedTo: null,
        dailyCooldown: 0,
        messageCount: inHist.messageCount || 0,
        groupMessages: inHist.groupMessages || {},
        commandCounts: inHist.commandCounts || {},
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
        name: inHist.name || null,
        id: userId,
        lastWorkTime: 0,
        dailyStreak: inHist.dailyStreak !== null ? inHist.dailyStreak : 0,
        lastDailyClaim: inHist.lastDailyClaim || null
      };

      // Ekwipunek DOKŁADNIE z pliku (lub pusty jeśli w pliku nie było !eq)
      mergedInventory[userId] = historyInventory[userId] || {};
    } else {
      // Gracze NIEObecni w pliku historii:
      // Zachowujemy pfp/poziomy ze starej bazy, ale WYZEROWUJEMY portfel/bank/eq
      countResetEconomyOnly++;
      mergedUsers[userId] = {
        ...oldU,
        id: userId,
        name: oldU.name || null,
        balance: 5000,
        bank: 10000,
        level: oldU.level || 1,
        xp: oldU.xp || 0,
        dailyStreak: oldU.dailyStreak || 0,
        lastDailyClaim: oldU.lastDailyClaim || null,
        messageCount: oldU.messageCount || 0,
        commandsUsed: oldU.commandsUsed || 0,
        gamesPlayed: oldU.gamesPlayed || 0,
        wins: oldU.wins || 0,
        losses: oldU.losses || 0,
        totalWon: oldU.totalWon || 0,
        totalLost: oldU.totalLost || 0,
        prestige: oldU.prestige || 0,
        badges: oldU.badges || [],
        bio: oldU.bio || '',
        workLevel: oldU.workLevel || 1,
        claimedMilestones: oldU.claimedMilestones || []
      };
      mergedInventory[userId] = {};
    }
  }

  console.log(`[STRICT-OVERRIDE] Łączna liczba graczy w bazie: ${Object.keys(mergedUsers).length}`);
  console.log(`  - Gracze w pliku (ich stany lokalne USUNIĘTO i ustawiono 1:1 z pliku): ${countStrictlyOverwritten}`);
  console.log(`  - Gracze spoza pliku (zachowano pfp/poziomy ze starej bazy, WYZEROWANO portfel/bank/eq): ${countResetEconomyOnly}`);

  const targets = [DATA_DIR, SEED_DIR, BACKUP_DIR];

  for (const targetDir of targets) {
    if (!fs.existsSync(targetDir) && targetDir !== BACKUP_DIR) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (fs.existsSync(targetDir) || targetDir !== BACKUP_DIR) {
      saveJson(path.join(targetDir, 'users.json'), mergedUsers);
      saveJson(path.join(targetDir, 'profiles.json'), mergedProfiles);
      saveJson(path.join(targetDir, 'inventory.json'), mergedInventory);
      saveJson(path.join(targetDir, 'groupStats.json'), mergedGroupStats);
    }
  }

  console.log('[STRICT-OVERRIDE] Sukces! Dane zostały zastąpione 1:1 bez łączenia Math.max.');
}

main();
