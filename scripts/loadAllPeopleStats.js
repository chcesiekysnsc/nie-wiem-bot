const fs = require('fs');
const path = require('path');
const { withData, createUser, loadData, saveData, DATA_DIR } = require('../utils/storage');

const STATS_FILE = path.join(__dirname, '..', 'data_seed', 'statystyki_wszystkich_osob_najblizej_27-08-2026_20-00.json');

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

function parseProfile(response) {
  const result = {};
  const walletMatch = response.match(/Portfel: 💰 ([\d\s]+)/);
  const bankMatch = response.match(/Bank: 💰 ([\d\s]+)/);
  if (walletMatch) result.wallet = parseInt(walletMatch[1].replace(/[^0-9]/g, ''), 10) || 0;
  if (bankMatch) result.bank = parseInt(bankMatch[1].replace(/[^0-9]/g, ''), 10) || 0;

  const levelMatch = response.match(/Poziom: (\d+)/);
  if (levelMatch) result.level = parseInt(levelMatch[1], 10);

  const prestigeMatch = response.match(/Prestiż (\d+)/);
  if (prestigeMatch) result.prestige = parseInt(prestigeMatch[1], 10);

  const xpMatch = response.match(/\((\d+)\/(\d+) XP\)/);
  if (xpMatch) result.xp = parseInt(xpMatch[1], 10);

  const winsMatch = response.match(/Wygrane: \*\*(\d+)\*\*/);
  if (winsMatch) result.wins = parseInt(winsMatch[1], 10);

  const lossesMatch = response.match(/Przegrane: \*\*(\d+)\*\*/);
  if (lossesMatch) result.losses = parseInt(lossesMatch[1], 10);

  const gamesMatch = response.match(/Gry: (\d+)/);
  if (gamesMatch) result.gamesPlayed = parseInt(gamesMatch[1], 10);

  const badgesMatch = response.match(/Odznaki: (.+)/);
  if (badgesMatch) {
    result.badges = badgesMatch[1].split(',').map(b => b.trim()).filter(b => b.length > 0);
  }

  const nameMatch = response.match(/Profil: \*\*(.+?)\*\*/);
  if (nameMatch) result.name = nameMatch[1].trim();

  return result;
}

function main() {
  console.log('[LOAD_ALL] Wczytuję plik statystyk...');
  const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  const people = stats.people || [];
  console.log(`[LOAD_ALL] Znaleziono ${people.length} osób`);

  withData(store => {
    let updatedUsers = 0;
    let updatedInventory = 0;
    let updatedProfiles = 0;

    for (const person of people) {
      const userId = String(person.userId);
      if (!userId) continue;

        if (!store.users[userId]) {
          createUser(userId, store.users);
          if (person.name) {
            store.users[userId].name = person.name;
          }
        }

      const nearest = person.nearestStats || {};
      const user = store.users[userId];

      if (nearest.bal && nearest.bal.response) {
        const { wallet, bank } = parseBalance(nearest.bal.response);
        user.balance = wallet;
        user.bank = bank;
        updatedUsers++;
      }

      if (nearest.pfp && nearest.pfp.response) {
        const prof = parseProfile(nearest.pfp.response);
        if (prof.wallet) user.balance = prof.wallet;
        if (prof.bank) user.bank = prof.bank;
        if (prof.level) user.level = prof.level;
        if (prof.prestige) user.prestige = prof.prestige;
        if (prof.xp) user.xp = prof.xp;
        if (prof.wins) user.wins = prof.wins;
        if (prof.losses) user.losses = prof.losses;
        if (prof.gamesPlayed) user.gamesPlayed = prof.gamesPlayed;
        if (prof.badges && prof.badges.length > 0) user.badges = prof.badges;
        if (prof.name) user.name = prof.name;
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

    console.log(`[LOAD_ALL] Zaktualizowano: ${updatedUsers} użytkowników (salda/profil), ${updatedInventory} ekwipunków, ${updatedProfiles} daily.`);
  });

  console.log('[LOAD_ALL] Gotowe.');
}

main();
