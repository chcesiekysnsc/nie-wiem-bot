const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const HISTORY_FILE = 'C:\\Users\\dupek\\Downloads\\file-1788729864683';
const DATA_DIR = path.join(__dirname, '..', 'data');
const SEED_DIR = path.join(__dirname, '..', 'data_seed');
const BACKUP_DIR = 'C:\\Users\\dupek\\.gemini\\antigravity\\db_backups';
const OLD_BACKUP_INV_FILE = path.join(__dirname, '..', 'data_backup_before_restore_20260827_234536', 'inventory.json');

const config = require('../config/config');
const { eventItems } = require('../commands/eventitemy');

function saveJson(p, data) {
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[ZAPISANO] ${p} (${fs.statSync(p).size.toLocaleString()} B)`);
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
  console.log('[APPLY-FULL-STATE] Wczytuję plik historii:', HISTORY_FILE);
  if (!fs.existsSync(HISTORY_FILE)) {
    console.error('[BŁĄD] Plik historii nie istnieje:', HISTORY_FILE);
    process.exit(1);
  }

  const msgs = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  msgs.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  console.log(`[APPLY-FULL-STATE] Wczytano ${msgs.length} wiadomości.`);

  // Słowniki przedmiotów
  let count = 0;
  const numToItemId = {};
  const nameToItemId = {};

  for (const [id, item] of Object.entries(config.shopItems || {})) {
    const num = (id === 'karta_vip') ? 100 : ++count;
    numToItemId[num] = id;
    if (item.name) nameToItemId[item.name.toLowerCase().trim()] = id;
  }

  for (const [id, item] of Object.entries(eventItems || {})) {
    if (item.name) nameToItemId[item.name.toLowerCase().trim()] = id;
    nameToItemId[id.toLowerCase().trim()] = id;
  }

  nameToItemId['deweloper'] = 'deweloper';
  nameToItemId['szwajcarski zegarek'] = 'szwajcarski_zegarek';
  nameToItemId['nether blade'] = 'nether_blade';
  nameToItemId['szkarłatne oko krupiera'] = 'szkarlatne_oko';
  nameToItemId['cien nocy'] = 'cien_nocy';
  nameToItemId['cień nocy'] = 'cien_nocy';
  nameToItemId['wampirzy sztylet'] = 'wampirzy_sztylet';
  nameToItemId['szwajcarski klucz'] = 'szwajcarski_klucz';
  nameToItemId['krysztal doswiadczenia'] = 'krysztal_doswiadczenia';
  nameToItemId['kryształ doświadczenia'] = 'krysztal_doswiadczenia';
  nameToItemId['ananas na pizzy'] = 'ananas_na_pizzy';
  nameToItemId['czarna bandera'] = 'czarna_bandera';
  nameToItemId['czarna karta'] = 'czarna_karta';
  nameToItemId['kosci oszusta'] = 'kosci_oszusta';
  nameToItemId['kości oszusta'] = 'kosci_oszusta';
  nameToItemId['czterolistna moneta'] = 'czterolistna_moneta';
  nameToItemId['mark of sacrifice'] = 'mark_of_sacrifice';
  nameToItemId['polityk'] = 'polityk';
  nameToItemId['krolewskie insygnia'] = 'krolewskie_insygnia';
  nameToItemId['królewskie insygnia'] = 'krolewskie_insygnia';

  // Bazy wzorcowe
  const oldUsers = loadGitJson('c6d3cc5:data_seed/users.json');
  const oldProfiles = loadGitJson('c6d3cc5:data_seed/profiles.json');
  const oldGroupStats = loadGitJson('c6d3cc5:data_seed/groupStats.json');
  let oldBackupInv = {};
  if (fs.existsSync(OLD_BACKUP_INV_FILE)) {
    try {
      oldBackupInv = JSON.parse(fs.readFileSync(OLD_BACKUP_INV_FILE, 'utf8'));
    } catch (_) {}
  }

  // Budowa mapy nazwisk (z pominięciem AI botów)
  const nameToId = {};
  const idToName = {};

  for (const [id, u] of Object.entries(oldUsers)) {
    if (id.startsWith('ai_')) continue;
    if (u.name) {
      nameToId[u.name.toLowerCase().trim()] = id;
      idToName[id] = u.name;
    }
  }

  nameToId['domaa kowalik'] = '100075575230196';
  nameToId['emilka agnieszka'] = '100083839521308';
  nameToId['eryk kochanowski'] = '100011378042556';
  nameToId['wojciech wiśniewski'] = '100012870817390';
  nameToId['tomek jaworski'] = '100022714232742';
  nameToId['robert robert'] = '61589962859070';
  nameToId['kuba kuba'] = '61569336041523';
  nameToId['zuza zuza'] = '100081146470738';
  nameToId['larry pelen milosci'] = '61554894353095';

  // Mapowania z dumpa
  for (const m of msgs) {
    if (m.isBotResponse && m.body) {
      const profIdM = m.body.match(/🆔\s*ID:\s*\*?\*?(\d+)\*?\*?/);
      const profNameM = m.body.match(/Profil:\s*\*?\*?([^*\n]+)\*?\*?/);
      if (profIdM && profNameM) {
        const pName = profNameM[1].trim().toLowerCase();
        const pId = profIdM[1].trim();
        nameToId[pName] = pId;
        idToName[pId] = profNameM[1].trim();
      }
    }
  }

  const threadLastUser = {};
  for (const m of msgs) {
    const tid = String(m.threadId || '');
    const sid = String(m.senderID || '');
    const body = String(m.body || '');

    if (!m.isBotResponse && sid && !sid.startsWith('ai_')) {
      threadLastUser[tid] = sid;
    }

    if (m.isBotResponse && threadLastUser[tid]) {
      const uid = threadLastUser[tid];
      const saldoM = body.match(/Saldo\s*—\s*\*?\*?([^*\n]+)\*?\*?/);
      if (saldoM && !nameToId[saldoM[1].trim().toLowerCase()]) {
        const sName = saldoM[1].trim().toLowerCase();
        nameToId[sName] = uid;
        idToName[uid] = saldoM[1].trim();
      }
    }
  }

  // WIPE_TS: 6.09.2026 ~21:21:40 — moment resetu bota na live
  const WIPE_TS = 1788722500000;

  const dumpUsers = {};
  const dumpInventory = {};
  const dumpProfiles = JSON.parse(JSON.stringify(oldProfiles || {}));
  const dumpGroupStats = {};
  const seenUsersInDump = new Set();

  function getDumpUser(uid) {
    if (uid.startsWith('ai_')) return null;
    seenUsersInDump.add(uid);
    if (!dumpUsers[uid]) {
      const base = oldUsers[uid] || {};
      dumpUsers[uid] = {
        id: uid,
        name: idToName[uid] || base.name || null,
        balance: null,
        bank: null,
        level: base.level || 1,
        xp: base.xp || 0,
        prestige: base.prestige || 0,
        dailyStreak: null,
        lastDailyClaim: null,
        messageCount: 0,
        groupMessages: {},
        commandsUsed: 0,
        commandCounts: {},
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        totalWon: 0,
        totalLost: 0,
        workLevel: base.workLevel || 1,
        bio: base.bio || '',
        badges: base.badges || [],
        marriedTo: base.marriedTo || null,
        claimedMilestones: base.claimedMilestones || [],
        activeLoan: null,
        blacklistedForNegativeBalance: false,
        dailyCooldown: 0,
        workBoostUntil: 0,
        workBoostPercent: 0,
        tempCooldownReductionUntil: 0,
        negativeSince: null,
        openedPackagesToday: 0,
        lastPackageOpenDate: null,
        company: null,
        company2: null,
        defaultCity: null,
        lastWorkTime: 0
      };
    }
    return dumpUsers[uid];
  }

  // Inicjalizacja gangów w profiles
  dumpProfiles.gangs = dumpProfiles.gangs || {};

  // Parsowanie chronologiczne
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const tid = String(m.threadId || '');
    const sid = String(m.senderID || '');
    const body = String(m.body || '');
    const ts = Number(m.ts || 0);

    if (!tid) continue;

    // Grupy
    if (!dumpGroupStats[tid]) {
      dumpGroupStats[tid] = {
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
    const g = dumpGroupStats[tid];
    g.visibleMessages++;
    g.processedMessages++;
    if (ts && (!g.firstUse || ts < g.firstUse)) g.firstUse = ts;
    if (ts && ts > g.lastUpdated) g.lastUpdated = ts;
    if (m.messageID) {
      g.seenMessageIds.push(m.messageID);
      if (g.seenMessageIds.length > 2000) g.seenMessageIds.shift();
    }

    // Użytkownicy - wiadomości
    if (!m.isBotResponse && sid && !sid.startsWith('ai_')) {
      threadLastUser[tid] = sid;
      const u = getDumpUser(sid);
      if (u) {
        u.messageCount++;
        u.groupMessages[tid] = (u.groupMessages[tid] || 0) + 1;

        if (body.startsWith('!')) {
          const tokens = body.slice(1).trim().split(/\s+/);
          const cmd = (tokens.shift() || '').toLowerCase();
          if (cmd) {
            u.commandsUsed++;
            u.commandCounts[cmd] = (u.commandCounts[cmd] || 0) + 1;
            g.commandsExecuted++;
          }
        }
      }
    }

    // Odpowiedzi bota
    if (m.isBotResponse && body) {
      // 1. Saldo
      const saldoM = body.match(/Saldo\s*—\s*\*?\*?([^*\n]+)\*?\*?/);
      if (saldoM) {
        const pName = saldoM[1].trim();
        const uid = nameToId[pName.toLowerCase()] || threadLastUser[tid];
        if (uid && !uid.startsWith('ai_')) {
          const u = getDumpUser(uid);
          if (u) {
            u.name = pName;
            const wm = body.match(/Portfel:\s*💰?\s*([\d\s,]+)/);
            const bm = body.match(/Bank:\s*💰?\s*([\d\s,]+)/);
            if (wm && bm) {
              const wallet = parseInt(wm[1].replace(/[^0-9]/g, ''), 10);
              const bank = parseInt(bm[1].replace(/[^0-9]/g, ''), 10);
              if (ts > WIPE_TS && wallet === 5000 && bank === 10000 && u.balance !== null) {
                // ignoruj wyzerowany stan po crashu
              } else {
                u.balance = wallet;
                u.bank = bank;
              }
            }
          }
        }
      }

      // 2. Ekwipunek
      const eqM = body.match(/Ekwipunek\s*—\s*\*?\*?([^*\n]+)\*?\*?/);
      if (eqM) {
        const pName = eqM[1].trim();
        const uid = nameToId[pName.toLowerCase()] || threadLastUser[tid];
        if (uid && !uid.startsWith('ai_')) {
          const u = getDumpUser(uid);
          if (u) {
            u.name = pName;

            const wm = body.match(/Portfel:\s*💰?\s*([\d\s,]+)/);
            const bm = body.match(/Bank:\s*💰?\s*([\d\s,]+)/);
            if (wm && bm) {
              const wallet = parseInt(wm[1].replace(/[^0-9]/g, ''), 10);
              const bank = parseInt(bm[1].replace(/[^0-9]/g, ''), 10);
              if (ts > WIPE_TS && wallet === 5000 && bank === 10000 && u.balance !== null) {
                // skip
              } else if (u.balance === null) {
                u.balance = wallet;
                u.bank = bank;
              }
            }

            const items = {};
            const lines = body.split('\n');
            for (const line of lines) {
              if (line.includes('Portfel:') || line.includes('Ekwipunek') || line.includes('Brak przedmiotów') || line.includes('!use') || line.includes('!eq help')) continue;
              if (!line.trim()) continue;

              let itemId = null;
              let qty = 1;
              const qtyM = line.match(/x(\d+)/);
              if (qtyM) qty = parseInt(qtyM[1], 10);

              const numM = line.match(/^(\d+)\.\s+/);
              if (numM && numToItemId[parseInt(numM[1], 10)]) {
                itemId = numToItemId[parseInt(numM[1], 10)];
              } else {
                const boldM = line.match(/\*\*([^*]+)\*\*/);
                if (boldM) {
                  const rawName = boldM[1].trim().toLowerCase();
                  if (nameToItemId[rawName]) {
                    itemId = nameToItemId[rawName];
                  }
                }
              }

              if (itemId && qty > 0) {
                items[itemId] = qty;
              }
            }

            if (ts > WIPE_TS && Object.keys(items).length === 0 && dumpInventory[uid] && Object.keys(dumpInventory[uid]).length > 0) {
              // skip
            } else {
              dumpInventory[uid] = items;
            }
          }
        }
      }

      // 3. Ranking Kasynowy — aktualizacja majątku na bieżąco
      if (body.includes('Ranking Kasynowy') && ts < WIPE_TS) {
        const lines = body.split('\n');
        for (const line of lines) {
          const match = line.match(/[🥇🥈🥉\d\.]+\s*\*?\*?([^*—]+?)\*?\*?\s*—\s*([\d\s,]+)/);
          if (match) {
            const rawName = match[1].trim();
            const total = parseInt(match[2].replace(/[^0-9]/g, ''), 10);
            const uid = nameToId[rawName.toLowerCase()];
            if (uid && !uid.startsWith('ai_')) {
              const u = getDumpUser(uid);
              if (u) {
                u.name = rawName;
                const bank = u.bank || 0;
                u.balance = Math.max(0, total - bank);
              }
            }
          }
        }
      }

      // 4. Profil
      if (body.includes('Profil:')) {
        const profNameM = body.match(/Profil:\s*\*?\*?([^*\n]+)\*?\*?/);
        const profIdM = body.match(/🆔\s*ID:\s*\*?\*?(\d+)\*?\*?/);
        const uid = profIdM ? profIdM[1].trim() : (profNameM ? nameToId[profNameM[1].trim().toLowerCase()] : threadLastUser[tid]);
        if (uid && !uid.startsWith('ai_')) {
          const u = getDumpUser(uid);
          if (u) {
            if (profNameM) u.name = profNameM[1].trim();
            const wm = body.match(/Portfel:\s*💰?\s*([\d\s,]+)/);
            const bm = body.match(/Bank:\s*💰?\s*([\d\s,]+)/);
            if (wm && bm) {
              const wallet = parseInt(wm[1].replace(/[^0-9]/g, ''), 10);
              const bank = parseInt(bm[1].replace(/[^0-9]/g, ''), 10);
              if (ts > WIPE_TS && wallet === 5000 && bank === 10000 && u.balance !== null) {
                // skip
              } else {
                u.balance = wallet;
                u.bank = bank;
              }
            }

            const lm = body.match(/Poziom:\s*(\d+)/);
            const presM = body.match(/\[Prestiż\s*(\d+)\]/);
            const xpm = body.match(/\((\d+)\/(\d+)\s*XP\)/);
            if (lm) u.level = parseInt(lm[1], 10);
            if (presM) u.prestige = parseInt(presM[1], 10);
            if (xpm) u.xp = parseInt(xpm[1], 10);

            const gm = body.match(/Gry:\s*(\d+)/);
            const cmdM = body.match(/Komendy:\s*(\d+)/);
            const winM = body.match(/Wygrane:\s*\*?(\d+)\*?/);
            const lossM = body.match(/Przegrane:\s*\*?(\d+)\*?/);
            if (gm) u.gamesPlayed = parseInt(gm[1], 10);
            if (cmdM) u.commandsUsed = parseInt(cmdM[1], 10);
            if (winM) u.wins = parseInt(winM[1], 10);
            if (lossM) u.losses = parseInt(lossM[1], 10);
          }
        }
      }

      // 5. Daily
      if (body.includes('Odebrano daily!') || body.includes('Odebrano nagrodę daily')) {
        const am = body.match(/\+\s*💰?\s*([\d\s,]+)/);
        const dm = body.match(/Dzień:\s*(\d+)/);
        let claimerId = null;
        for (let j = i - 1; j >= 0; j--) {
          if (msgs[j].threadId === tid && !msgs[j].isBotResponse) {
            claimerId = msgs[j].senderID;
            break;
          }
        }
        if (claimerId && !claimerId.startsWith('ai_')) {
          const u = getDumpUser(claimerId);
          if (u) {
            u.lastDailyClaim = ts;
            if (dm) u.dailyStreak = parseInt(dm[1], 10);
            dumpProfiles[claimerId] = dumpProfiles[claimerId] || {};
            if (am) dumpProfiles[claimerId].lastDailyAmount = parseInt(am[1].replace(/[^0-9]/g, ''), 10);
            if (dm) dumpProfiles[claimerId].lastDailyDay = parseInt(dm[1], 10);
          }
        }
      }

      // 6. Gangi — Ranking i szczegóły sejfów
      if (body.includes('Ranking Gangów') && ts < WIPE_TS) {
        const lines = body.split('\n');
        for (const line of lines) {
          const match = line.match(/\*\*([^*]+)\*\*\s*\(Boss:[^)]+\)\s*—\s*💰?\s*([\d\s,]+)/) ||
                        line.match(/\*\*([^*]+)\*\*\s*\(Boss:[^)]+,\s*\d+\s*członków[^\)]*\)\s*—\s*💰?\s*([\d\s,]+)/);
          if (match) {
            const gName = match[1].trim();
            const gVault = parseInt(match[2].replace(/[^0-9]/g, ''), 10);
            // Znajdź gang w dumpProfiles.gangs
            const gKey = Object.keys(dumpProfiles.gangs).find(k => dumpProfiles.gangs[k]?.name?.toLowerCase() === gName.toLowerCase());
            if (gKey) {
              dumpProfiles.gangs[gKey].vault = gVault;
            }
          }
        }
      }

      if (body.includes('Sejf gangu:') && ts < WIPE_TS) {
        const gangNameM = body.match(/GANG:\s*\*?\*?([^*\n👥]+)\*?\*?/i);
        const vaultM = body.match(/Sejf gangu:\s*\*?\*?💰?\s*([\d\s,]+)\*?\*?/i);
        if (gangNameM && vaultM) {
          const gName = gangNameM[1].trim();
          const gVault = parseInt(vaultM[1].replace(/[^0-9]/g, ''), 10);
          const gKey = Object.keys(dumpProfiles.gangs).find(k => dumpProfiles.gangs[k]?.name?.toLowerCase() === gName.toLowerCase());
          if (gKey) {
            dumpProfiles.gangs[gKey].vault = gVault;
          }
        }
      }
    }
  }

  // Precyzyjne wartości sejfów gangów z dumpa
  const knownGangVaults = {
    militech: 9973824,
    chembarons: 8642545,
    izraelici: 8448844,
    auramonsters: 1481508,
    mojaxdd: 1426637,
    huck2flat: 733575,
    wkf: 689804,
    kotki: 678562,
    taksiczuj: 500000,
    parafiatuptusiow: 100322,
    nelaispolka: 28526
  };

  for (const [gKey, vault] of Object.entries(knownGangVaults)) {
    if (dumpProfiles.gangs[gKey]) {
      dumpProfiles.gangs[gKey].vault = vault;
    }
  }

  // Łączenie użytkowników
  const allUserIds = new Set([
    ...Object.keys(oldUsers),
    ...Object.keys(dumpUsers)
  ]);

  const finalUsers = {};
  const finalInventory = {};
  const finalProfiles = { ...oldProfiles, ...dumpProfiles };
  const finalGroupStats = { ...oldGroupStats };

  for (const [tid, gData] of Object.entries(dumpGroupStats)) {
    const existing = finalGroupStats[tid] || {
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

    finalGroupStats[tid] = {
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

  let countDumpActive = 0;
  let countResetInactive = 0;

  for (const uid of allUserIds) {
    const fromDump = dumpUsers[uid];
    const oldU = oldUsers[uid] || {};

    if (fromDump) {
      countDumpActive++;
      finalUsers[uid] = {
        ...oldU,
        ...fromDump,
        id: uid,
        name: fromDump.name || oldU.name || null,
        balance: fromDump.balance !== null ? fromDump.balance : 5000,
        bank: fromDump.bank !== null ? fromDump.bank : 10000,
        dailyStreak: fromDump.dailyStreak !== null ? fromDump.dailyStreak : (oldU.dailyStreak || 0),
        lastDailyClaim: fromDump.lastDailyClaim || oldU.lastDailyClaim || null,
        level: fromDump.level || oldU.level || 1,
        xp: fromDump.xp || oldU.xp || 0,
        workLevel: fromDump.workLevel || oldU.workLevel || 1,
        prestige: fromDump.prestige || oldU.prestige || 0,
        messageCount: Math.max(oldU.messageCount || 0, fromDump.messageCount || 0),
        commandsUsed: Math.max(oldU.commandsUsed || 0, fromDump.commandsUsed || 0)
      };

      if (dumpInventory[uid] && Object.keys(dumpInventory[uid]).length > 0) {
        finalInventory[uid] = dumpInventory[uid];
      } else if (oldBackupInv[uid] && Object.keys(oldBackupInv[uid]).length > 0) {
        finalInventory[uid] = oldBackupInv[uid];
      } else {
        finalInventory[uid] = {};
      }
    } else {
      countResetInactive++;
      finalUsers[uid] = {
        ...oldU,
        id: uid,
        name: oldU.name || null,
        level: oldU.level || 1,
        xp: oldU.xp || 0,
        prestige: oldU.prestige || 0,
        workLevel: oldU.workLevel || 1,
        badges: oldU.badges || [],
        bio: oldU.bio || '',
        marriedTo: oldU.marriedTo || null,
        messageCount: oldU.messageCount || 0,
        commandsUsed: oldU.commandsUsed || 0,
        gamesPlayed: oldU.gamesPlayed || 0,
        wins: oldU.wins || 0,
        losses: oldU.losses || 0,
        claimedMilestones: oldU.claimedMilestones || [],
        balance: 5000,
        bank: 10000,
        dailyStreak: 0,
        lastDailyClaim: null,
        totalWon: 0,
        totalLost: 0,
        activeLoan: null,
        dailyCooldown: 0,
        lastWorkTime: 0
      };

      finalInventory[uid] = {};
    }
  }

  console.log(`[APPLY-FULL-STATE] Podsumowanie:`);
  console.log(`  - Aktywni gracze z dumpa: ${countDumpActive}`);
  console.log(`  - Nieobecni w dumpie: ${countResetInactive}`);
  console.log(`  - Łącznie graczy w bazie: ${Object.keys(finalUsers).length}`);
  console.log(`  - Ekwipunki z przedmiotami: ${Object.values(finalInventory).filter(i => Object.keys(i).length > 0).length}`);
  console.log(`  - Zaktualizowane sejfy gangów: ${Object.values(dumpProfiles.gangs).filter(g => (g.vault||0) > 0).length}`);

  // Zapis do wszystkich celów
  const targets = [DATA_DIR, SEED_DIR, BACKUP_DIR];
  for (const targetDir of targets) {
    if (!fs.existsSync(targetDir) && targetDir !== BACKUP_DIR) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    if (fs.existsSync(targetDir) || targetDir !== BACKUP_DIR) {
      saveJson(path.join(targetDir, 'users.json'), finalUsers);
      saveJson(path.join(targetDir, 'inventory.json'), finalInventory);
      saveJson(path.join(targetDir, 'profiles.json'), finalProfiles);
      saveJson(path.join(targetDir, 'groupStats.json'), finalGroupStats);
    }
  }

  console.log('[APPLY-FULL-STATE] Gotowe! Salda graczy i sejfy gangów zsynchronizowane na stan 21:19 - 21:30.');
}

main();
