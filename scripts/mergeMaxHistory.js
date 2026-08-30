const fs = require('fs');
const path = require('path');

const HISTORY = 'C:\\Users\\dupek\\Downloads\\file-1788009510140';
const SEED_DIR = path.join(__dirname, '..', 'data_seed');

function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return {}; }
}

function largerBalance(a, b) {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

function newerTimestamp(a, b) {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

function main() {
  const messages = JSON.parse(fs.readFileSync(HISTORY, 'utf8'));
  console.log(`[MERGE-MAX] Wiadomości: ${messages.length}`);

  const latest = {};
  const threadUser = {};
  for (const msg of messages) {
    const tid = String(msg.threadId || '');
    const sid = String(msg.senderID || '');
    const body = String(msg.body || '');
    if (!msg.isBotResponse && sid) threadUser[tid] = sid;
    if (msg.isBotResponse && threadUser[tid]) {
      const uid = threadUser[tid];
      if (!latest[uid]) latest[uid] = { balance: null, bank: null, inventory: {}, dailyStreak: null, lastDailyClaim: null };
      if (body.includes('Saldo')) {
        const wm = body.match(/Portfel: .*?([\d\s]+)/);
        const bm = body.match(/Bank: .*?([\d\s]+)/);
        if (wm) latest[uid].balance = parseInt(wm[1].replace(/[^0-9]/g, ''), 10);
        if (bm) latest[uid].bank = parseInt(bm[1].replace(/[^0-9]/g, ''), 10);
      }
      if (body.includes('Ekwipunek')) {
        for (const line of body.split('\n')) {
          const m = line.match(/^(\d+)\.\s*(.+?)\s*x(\d+)/);
          if (m) latest[uid].inventory[m[2].trim()] = parseInt(m[3], 10);
        }
      }
      if (body.includes('Odebrano daily!')) {
        const am = body.match(/\+.+?\s([\d\s]+)/);
        const dm = body.match(/Dzień:\s*(\d+)/);
        if (am) latest[uid].dailyAmount = parseInt(am[1].replace(/[^0-9]/g, ''), 10);
        if (dm) latest[uid].dailyStreak = parseInt(dm[1], 10);
        latest[uid].lastDailyClaim = Date.now();
      }
    }
  }
  console.log(`[MERGE-MAX] Użytkowników z historii: ${Object.keys(latest).length}`);

  const users = loadJson(path.join(SEED_DIR, 'users.json'));
  const inventory = loadJson(path.join(SEED_DIR, 'inventory.json'));

  let updated = 0;
  for (const [uid, hist] of Object.entries(latest)) {
    const user = users[uid];
    if (!user) continue;

    const beforeBalance = user.balance || 0;
    const beforeBank = user.bank || 0;
    const beforeStreak = user.dailyStreak || 0;
    const beforeClaim = user.lastDailyClaim || 0;

    user.balance = largerBalance(user.balance, hist.balance);
    user.bank = largerBalance(user.bank, hist.bank);
    user.dailyStreak = largerBalance(user.dailyStreak, hist.dailyStreak);
    user.lastDailyClaim = newerTimestamp(user.lastDailyClaim, hist.lastDailyClaim);

    if (Object.keys(hist.inventory).length > 0) {
      if (!inventory[uid]) inventory[uid] = {};
      const mergedInv = { ...(inventory[uid] || {}), ...hist.inventory };
      inventory[uid] = mergedInv;
    }

    if (user.balance !== beforeBalance || user.bank !== beforeBank || user.dailyStreak !== beforeStreak || user.lastDailyClaim !== beforeClaim) {
      updated++;
    }
  }

  fs.writeFileSync(path.join(SEED_DIR, 'users.json'), JSON.stringify(users, null, 2), 'utf8');
  fs.writeFileSync(path.join(SEED_DIR, 'inventory.json'), JSON.stringify(inventory, null, 2), 'utf8');
  console.log(`[MERGE-MAX] Zaktualizowano ${updated} użytkowników (tylko gdzie historia miała większe wartości).`);
}

main();
