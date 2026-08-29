const fs = require('fs');
const path = require('path');
const { withData, createUser } = require('../utils/storage');

// Ścieżka do logu czatu (można nadpisać zmienną środowiskową CHAT_LOG)
const CHAT_LOG = process.env.CHAT_LOG || path.join(__dirname, '..', 'chatlogs', 'file-1787997025391');

// ID bota (odpowiedzi z tym ID traktujemy jako odpowiedzi bota)
const BOT_ID = '61560227271099';

// Cel: 27.08.2026 20:00:00 czasu polskiego (CEST = UTC+2)
const TARGET = new Date('2026-08-27T20:00:00+02:00').getTime();

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

  const nameMatch = response.match(/\*\*Profil: (.+?)\*\*/);
  if (nameMatch) result.name = nameMatch[1].trim();

  const idMatch = response.match(/ID: \*\*(\d+)\*\*/);
  if (idMatch) result.id = idMatch[1];

  return result;
}

function detectType(body) {
  if (body.includes('Saldo —') || body.includes('Saldo —')) return 'bal';
  if (body.includes('**Profil:') || body.includes('👤 **Profil:')) return 'pfp';
  if (body.includes('Odebrano daily') || body.includes('daily!')) return 'daily';
  if (body.includes('Ekwipunek') || /^\s*\d+\.\s*.+\s*x\d+/m.test(body)) return 'eq';
  return null;
}

function main() {
  console.log('[CHATLOG] Wczytuję log czatu:', CHAT_LOG);
  const log = JSON.parse(fs.readFileSync(CHAT_LOG, 'utf8'));
  console.log(`[CHATLOG] Liczba wiadomości: ${log.length}`);

  // Pass 1: mapa nazwa -> ID z odpowiedzi !pfp
  const nameToId = {};
  for (const msg of log) {
    if (!msg.isBotResponse || msg.senderID !== BOT_ID) continue;
    const body = msg.body || '';
    if (body.includes('**Profil:') || body.includes('👤 **Profil:')) {
      const prof = parseProfile(body);
      if (prof.id && prof.name) {
        nameToId[prof.name] = prof.id;
      }
    }
  }
  console.log(`[CHATLOG] Zbudowano mapę nazwa→ID dla ${Object.keys(nameToId).length} osób`);

  // Pass 2: najbliższa odpowiedź 27-08 20:00 dla każdego użytkownika
  const best = {}; // best[userId][type] = { diff, response }
  let lastUserSender = null;

  for (const msg of log) {
    if (!msg.isBotResponse) {
      lastUserSender = msg.senderID;
      continue;
    }
    if (msg.senderID !== BOT_ID) continue;

    const body = msg.body || '';
    const type = detectType(body);
    if (!type) continue;

    let userId = null;
    if (type === 'pfp') {
      const prof = parseProfile(body);
      userId = prof.id;
    } else if (type === 'bal') {
      const nameMatch = body.match(/Saldo — \*(.+?)\*/);
      const name = nameMatch ? nameMatch[1].trim() : null;
      if (name && nameToId[name]) {
        userId = nameToId[name];
      } else {
        userId = lastUserSender;
      }
    } else {
      userId = lastUserSender;
    }

    if (!userId) continue;

    const diff = Math.abs((msg.ts || 0) - TARGET);
    if (!best[userId]) best[userId] = {};
    if (!best[userId][type] || diff < best[userId][type].diff) {
      best[userId][type] = { diff, response: body };
    }
  }

  const userCount = Object.keys(best).length;
  console.log(`[CHATLOG] Znaleziono dane dla ${userCount} użytkowników`);

  withData(store => {
    let updatedUsers = 0;
    let updatedInventory = 0;
    let updatedProfiles = 0;

    for (const userId of Object.keys(best)) {
      const uid = String(userId);
      if (!uid) continue;

      if (!store.users[uid]) {
        createUser(uid, store.users);
      }
      const user = store.users[uid];
      const nearest = best[uid];

      if (nearest.bal) {
        const { wallet, bank } = parseBalance(nearest.bal.response);
        user.balance = wallet;
        user.bank = bank;
        updatedUsers++;
      }

      if (nearest.pfp) {
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

      if (nearest.eq) {
        const items = parseEquipment(nearest.eq.response);
        if (Object.keys(items).length > 0) {
          if (!store.inventory) store.inventory = {};
          if (!store.inventory[uid]) store.inventory[uid] = {};
          store.inventory[uid] = { ...store.inventory[uid], ...items };
          updatedInventory++;
        }
      }

      if (nearest.daily) {
        const daily = parseDaily(nearest.daily.response);
        if (daily.amount > 0 || daily.day > 0) {
          if (!store.profiles) store.profiles = {};
          if (!store.profiles[uid]) store.profiles[uid] = {};
          store.profiles[uid].lastDailyAmount = daily.amount;
          store.profiles[uid].lastDailyDay = daily.day;
          updatedProfiles++;
        }
      }
    }

    console.log(`[CHATLOG] Zaktualizowano: ${updatedUsers} użytkowników (salda/profil), ${updatedInventory} ekwipunków, ${updatedProfiles} daily.`);
  });

  console.log('[CHATLOG] Gotowe.');
}

main();
