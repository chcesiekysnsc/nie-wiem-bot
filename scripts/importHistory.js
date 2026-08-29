const fs = require('fs');
const { withData, createUser, DATA_DIR } = require('../utils/storage');

const HISTORY_FILE = 'C:\\Users\\dupek\\Downloads\\file-1787997025391 (1)';

function parseBalance(body) {
  const walletMatch = body.match(/Portfel: 💰 ([\d\s]+)/);
  const bankMatch = body.match(/Bank: 💰 ([\d\s]+)/);
  const wallet = walletMatch ? parseInt(walletMatch[1].replace(/[^0-9]/g, ''), 10) : 0;
  const bank = bankMatch ? parseInt(bankMatch[1].replace(/[^0-9]/g, ''), 10) : 0;
  return { wallet: isNaN(wallet) ? 0 : wallet, bank: isNaN(bank) ? 0 : bank };
}

function parseEquipment(body) {
  const items = {};
  const lines = body.split('\n');
  for (const line of lines) {
    const match = line.match(/(\d+)\.\s*(.+?)\s*x(\d+)/);
    if (match) {
      const itemName = match[2].trim();
      const count = parseInt(match[3], 10);
      items[itemName] = count;
    }
  }
  return items;
}

function parseDaily(body) {
  const match = body.match(/\+💰 ([\d\s]+)/);
  const amount = match ? parseInt(match[1].replace(/[^0-9]/g, ''), 10) : 0;
  const dayMatch = body.match(/Dzień: (\d+)/);
  const day = dayMatch ? parseInt(dayMatch[1], 10) : 0;
  return { amount: isNaN(amount) ? 0 : amount, day: isNaN(day) ? 0 : day };
}

function main() {
  console.log('[HISTORY] Wczytuję historię wiadomości...');
  const messages = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  console.log(`[HISTORY] Znaleziono ${messages.length} wiadomości`);

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
        latestStats[userId] = { balance: null, bank: null, inventory: {}, dailyAmount: null, dailyDay: null, name: null };
      }

      const stats = latestStats[userId];

      if (body.includes('Saldo —')) {
        const { wallet, bank } = parseBalance(body);
        stats.balance = wallet;
        stats.bank = bank;
      }

      if (body.includes('Ekwipunek')) {
        const items = parseEquipment(body);
        if (Object.keys(items).length > 0) {
          stats.inventory = { ...stats.inventory, ...items };
        }
      }

      if (body.includes('Odebrano daily!')) {
        const daily = parseDaily(body);
        if (daily.amount > 0) stats.dailyAmount = daily.amount;
        if (daily.day > 0) stats.dailyDay = daily.day;
      }
    }
  }

  console.log(`[HISTORY] Zebrano statystyki dla ${Object.keys(latestStats).length} użytkowników`);

  withData(store => {
    let updatedUsers = 0;
    let updatedInventory = 0;
    let updatedProfiles = 0;

    for (const [userId, stats] of Object.entries(latestStats)) {
      if (!store.users[userId]) {
        createUser(userId, store.users);
      }

      const user = store.users[userId];

      if (stats.balance !== null) {
        user.balance = stats.balance;
        user.bank = stats.bank;
        updatedUsers++;
      }

      if (Object.keys(stats.inventory).length > 0) {
        if (!store.inventory) store.inventory = {};
        if (!store.inventory[userId]) store.inventory[userId] = {};
        store.inventory[userId] = { ...store.inventory[userId], ...stats.inventory };
        updatedInventory++;
      }

      if (stats.dailyAmount !== null) {
        if (!store.profiles) store.profiles = {};
        if (!store.profiles[userId]) store.profiles[userId] = {};
        store.profiles[userId].lastDailyAmount = stats.dailyAmount;
        if (stats.dailyDay !== null) store.profiles[userId].lastDailyDay = stats.dailyDay;
        updatedProfiles++;
      }
    }

    console.log(`[HISTORY] Zaktualizowano: ${updatedUsers} użytkowników (salda), ${updatedInventory} ekwipunków, ${updatedProfiles} daily.`);
  });

  console.log('[HISTORY] Gotowe.');
}

main();
