const fs = require('fs');
const path = require('path');

const NEW_HISTORY = 'C:\\Users\\dupek\\Downloads\\file-1788009510140';
const SEED_DIR = path.join(__dirname, '..', 'data_seed');

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return {};
  }
}

function main() {
  console.log('[MERGE2] Wczytuję nową historię...');
  const messages = JSON.parse(fs.readFileSync(NEW_HISTORY, 'utf8'));
  console.log(`[MERGE2] Znaleziono ${messages.length} wiadomości`);

  const latestStats = {};
  const threadLastUser = {};

  for (const msg of messages) {
    const threadId = String(msg.threadId || '');
    const senderId = String(msg.senderID || '');
    const body = String(msg.body || '');

    if (!threadId) continue;

    if (!msg.isBotResponse && senderId) {
      threadLastUser[threadId] = senderId;
    }

    if (msg.isBotResponse && threadLastUser[threadId]) {
      const userId = threadLastUser[threadId];
      if (!latestStats[userId]) {
        latestStats[userId] = { balance: null, bank: null, inventory: {}, dailyAmount: null, dailyDay: null };
      }

      const stats = latestStats[userId];

      if (body.includes('Saldo')) {
        const walletMatch = body.match(/Portfel: .*?([\d\s]+)/);
        const bankMatch = body.match(/Bank: .*?([\d\s]+)/);
        if (walletMatch) stats.balance = parseInt(walletMatch[1].replace(/[^0-9]/g, ''), 10);
        if (bankMatch) stats.bank = parseInt(bankMatch[1].replace(/[^0-9]/g, ''), 10);
      }

      if (body.includes('Ekwipunek')) {
        const lines = body.split('\n');
        for (const line of lines) {
          const match = line.match(/^(\d+)\.\s*(.+?)\s*x(\d+)/);
          if (match) {
            stats.inventory[match[2].trim()] = parseInt(match[3], 10);
          }
        }
      }

      if (body.includes('Odebrano daily!')) {
        const amountMatch = body.match(/\+.+?\s([\d\s]+)/);
        const dayMatch = body.match(/Dzień:\s*(\d+)/);
        if (amountMatch) stats.dailyAmount = parseInt(amountMatch[1].replace(/[^0-9]/g, ''), 10);
        if (dayMatch) stats.dailyDay = parseInt(dayMatch[1], 10);
      }
    }
  }

  console.log(`[MERGE2] Zebrano statystyki dla ${Object.keys(latestStats).length} użytkowników`);

  const users = loadJson(path.join(SEED_DIR, 'users.json'));
  const profiles = loadJson(path.join(SEED_DIR, 'profiles.json'));
  const inventory = loadJson(path.join(SEED_DIR, 'inventory.json'));

  let updatedBalances = 0;
  let updatedStreaks = 0;
  let updatedInventory = 0;

  for (const [userId, stats] of Object.entries(latestStats)) {
    if (!users[userId]) continue;

    if (stats.balance !== null) {
      users[userId].balance = stats.balance;
      users[userId].bank = stats.bank || 0;
      updatedBalances++;
    }

    if (stats.dailyDay !== null) {
      users[userId].dailyStreak = stats.dailyDay;
      updatedStreaks++;
    }

    if (Object.keys(stats.inventory).length > 0) {
      if (!inventory[userId]) inventory[userId] = {};
      inventory[userId] = { ...inventory[userId], ...stats.inventory };
      updatedInventory++;
    }
  }

  console.log(`[MERGE2] Zaktualizowano: ${updatedBalances} sald, ${updatedStreaks} daily streaków, ${updatedInventory} ekwipunków`);

  const files = {
    'users.json': users,
    'profiles.json': profiles,
    'inventory.json': inventory
  };

  for (const [fileName, data] of Object.entries(files)) {
    const targetPath = path.join(SEED_DIR, fileName);
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[MERGE2] Zapisano: ${fileName} (${fs.statSync(targetPath).size.toLocaleString()} bytes)`);
  }

  console.log('[MERGE2] Gotowe.');
}

main();
