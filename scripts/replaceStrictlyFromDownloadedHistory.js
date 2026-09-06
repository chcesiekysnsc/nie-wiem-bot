const fs = require('fs');
const path = require('path');

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
    console.log(`[ZAPISANO STRYKTNIE] ${p} (${fs.statSync(p).size.toLocaleString()} bajtów)`);
  } catch (e) {
    console.error(`Błąd zapisu ${p}:`, e.message);
  }
}

function main() {
  console.log('[STRICT-REPLACE] Wczytuję plik historii:', HISTORY_FILE);
  if (!fs.existsSync(HISTORY_FILE)) {
    console.error('[BŁĄD] Plik nie istnieje:', HISTORY_FILE);
    process.exit(1);
  }

  const msgs = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  // Sortuj chronologicznie
  msgs.sort((a, b) => (a.ts || 0) - (b.ts || 0));

  console.log(`[STRICT-REPLACE] Przetwarzam ${msgs.length} wiadomości od ${msgs[0]?.date} do ${msgs[msgs.length - 1]?.date}...`);

  const newUsers = {};
  const newInventory = {};
  const newProfiles = {};
  const newGroupStats = {};
  const threadLastUser = {};

  for (const msg of msgs) {
    const tid = String(msg.threadId || '');
    const sid = String(msg.senderID || '');
    const body = String(msg.body || '');
    const ts = Number(msg.ts || 0);

    if (!tid) continue;

    // Statystyki grup
    if (!newGroupStats[tid]) {
      newGroupStats[tid] = {
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
    const g = newGroupStats[tid];
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

    // Wiadomość użytkownika
    if (!msg.isBotResponse && sid) {
      threadLastUser[tid] = sid;

      if (!newUsers[sid]) {
        newUsers[sid] = {
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
          lastActiveThreadId: tid,
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
          id: sid,
          lastWorkTime: 0
        };
      }
      const u = newUsers[sid];
      u.messageCount++;
      u.groupMessages[tid] = (u.groupMessages[tid] || 0) + 1;
      u.lastActiveThreadId = tid;

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

    // Odpowiedź bota (odczytywanie stanu)
    if (msg.isBotResponse && threadLastUser[tid]) {
      const uid = threadLastUser[tid];
      if (!newUsers[uid]) continue;
      const u = newUsers[uid];

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

        const items = {};
        const lines = body.split('\n');
        for (const line of lines) {
          const m = line.match(/^(\d+)\.\s*(.+?)\s*x(\d+)/);
          if (m) {
            items[m[2].trim()] = parseInt(m[3], 10);
          }
        }
        newInventory[uid] = items;
      }

      // Daily
      if (body.includes('Odebrano daily!')) {
        const am = body.match(/\+\s*💰?\s*([\d\s,]+)/);
        const dm = body.match(/Dzień:\s*(\d+)/);
        if (am) {
          const amt = parseInt(am[1].replace(/[^0-9]/g, ''), 10);
          newProfiles[uid] = newProfiles[uid] || {};
          newProfiles[uid].lastDailyAmount = amt;
        }
        if (dm) {
          const day = parseInt(dm[1], 10);
          u.dailyStreak = day;
          u.lastDailyClaim = ts;
          newProfiles[uid] = newProfiles[uid] || {};
          newProfiles[uid].lastDailyDay = day;
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

  console.log(`[STRICT-REPLACE] Podsumowanie wyłącznie z historii:`);
  console.log(`  - Gracze: ${Object.keys(newUsers).length}`);
  console.log(`  - Ekwipunki: ${Object.keys(newInventory).length}`);
  console.log(`  - Profile: ${Object.keys(newProfiles).length}`);
  console.log(`  - Grupy: ${Object.keys(newGroupStats).length}`);

  const targets = [
    DATA_DIR,
    SEED_DIR,
    BACKUP_DIR
  ];

  for (const targetDir of targets) {
    if (!fs.existsSync(targetDir) && targetDir !== BACKUP_DIR) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (fs.existsSync(targetDir) || targetDir !== BACKUP_DIR) {
      saveJson(path.join(targetDir, 'users.json'), newUsers);
      saveJson(path.join(targetDir, 'profiles.json'), newProfiles);
      saveJson(path.join(targetDir, 'inventory.json'), newInventory);
      saveJson(path.join(targetDir, 'groupStats.json'), newGroupStats);
    }
  }

  console.log('[STRICT-REPLACE] Gotowe! Baza danych została całkowicie zastąpiona danymi z pliku historii.');
}

main();
