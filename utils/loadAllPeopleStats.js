const fs = require('fs');
const path = require('path');
const { withData, createUser, loadData, DATA_DIR } = require('./storage');

function findStatsFile() {
  try {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('statystyki_wszystkich_osob_') && f.endsWith('.json'));
    if (files.length === 0) return null;
    files.sort();
    return path.join(DATA_DIR, files[files.length - 1]);
  } catch (err) {
    console.error('[LOAD_ALL] Błąd szukania pliku statystyk:', err.message);
    return null;
  }
}

function parseBalance(response) {
  const walletMatch = response.match(/Portfel: 💰 ([\d\s]+)/);
  const bankMatch = response.match(/Bank: 💰 ([\d\s]+)/);
  const wallet = walletMatch ? parseInt(walletMatch[1].replace(/[^0-9]/g, ''), 10) : 0;
  const bank = bankMatch ? parseInt(bankMatch[1].replace(/[^0-9]/g, ''), 10) : 0;
  return { wallet: isNaN(wallet) ? 0 : wallet, bank: isNaN(bank) ? 0 : bank };
}

function parseEquipment(response) {
  const items = {};
  const lines = response.split('\n');
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

function parseDaily(response) {
  const match = response.match(/\+💰 ([\d\s]+)/);
  const amount = match ? parseInt(match[1].replace(/[^0-9]/g, ''), 10) : 0;
  const dayMatch = response.match(/Dzień: (\d+)/);
  const day = dayMatch ? parseInt(dayMatch[1], 10) : 0;
  return { amount: isNaN(amount) ? 0 : amount, day: isNaN(day) ? 0 : day };
}

function loadAllPeopleStats() {
  const filePath = findStatsFile();
  if (!filePath) {
    console.log('[LOAD_ALL] Brak pliku statystyk do wczytania.');
    return;
  }

  console.log(`[LOAD_ALL] Znaleziono plik statystyk: ${path.basename(filePath)}`);

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const people = data.people || [];

    withData(store => {
      let updatedUsers = 0;
      let updatedInventory = 0;
      let updatedProfiles = 0;

      for (const person of people) {
        const userId = String(person.userId);
        if (!userId) continue;

        if (!store.users[userId]) {
          createUser(userId, person.name || userId);
        }

        const nearest = person.nearestStats || {};
        const user = store.users[userId];

        if (nearest.bal && nearest.bal.response) {
          const { wallet, bank } = parseBalance(nearest.bal.response);
          user.balance = wallet;
          user.bank = bank;
          updatedUsers++;
        }

        if (nearest.eq && nearest.eq.response) {
          const items = parseEquipment(nearest.eq.response);
          if (Object.keys(items).length > 0) {
            if (!store.inventory) store.inventory = {};
            if (!store.inventory[userId]) store.inventory[userId] = {};
            store.inventory[userId] = { ...store.inventory[userId], ...items };
            updatedInventory++;
          }
        }

        if (nearest.daily && nearest.daily.response) {
          const daily = parseDaily(nearest.daily.response);
          if (daily.amount > 0 || daily.day > 0) {
            if (!store.profiles) store.profiles = {};
            if (!store.profiles[userId]) store.profiles[userId] = {};
            store.profiles[userId].lastDailyAmount = daily.amount;
            store.profiles[userId].lastDailyDay = daily.day;
            updatedProfiles++;
          }
        }

        if (person.name && (!user.name || user.name === userId)) {
          user.name = person.name;
        }
      }

      console.log(`[LOAD_ALL] Zaktualizowano: ${updatedUsers} użytkowników (salda), ${updatedInventory} ekwipunków, ${updatedProfiles} daily.`);
    });

    const processedPath = filePath.replace(/\.json$/, '.przetworzony.json');
    fs.renameSync(filePath, processedPath);
    console.log(`[LOAD_ALL] Przeniesiono plik do: ${path.basename(processedPath)}`);
  } catch (err) {
    console.error('[LOAD_ALL] Błąd ładowania statystyk:', err.message);
  }
}

module.exports = { loadAllPeopleStats };
