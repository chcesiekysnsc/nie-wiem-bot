const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../utils/storage');

const BACKUP_FILE = 'C:\\Users\\dupek\\Downloads\\backup_database (4).json';
const STATS_FILE = 'C:\\Users\\dupek\\Downloads\\statystyki_wszystkich_osob_najblizej_27-08-2026_20-00.json';
const SEED_DIR = path.join(__dirname, '..', 'data_seed');

function parseBalance(response) {
  const walletMatch = response.match(/Portfel: 💰 ([\d\s]+)/);
  const bankMatch = response.match(/Bank: 💰 ([\d\s]+)/);
  const wallet = walletMatch ? parseInt(walletMatch[1].replace(/[^0-9]/g, ''), 10) : 0;
  const bank = bankMatch ? parseInt(bankMatch[1].replace(/[^0-9]/g, ''), 10) : 0;
  return { wallet: isNaN(wallet) ? 0 : wallet, bank: isNaN(bank) ? 0 : bank };
}

function parseDaily(response) {
  const match = response.match(/\+💰 ([\d\s]+)/);
  const amount = match ? parseInt(match[1].replace(/[^0-9]/g, ''), 10) : 0;
  const dayMatch = response.match(/Dzień: (\d+)/);
  const day = dayMatch ? parseInt(dayMatch[1], 10) : 0;
  return { amount: isNaN(amount) ? 0 : amount, day: isNaN(day) ? 0 : day };
}

function parseDate(dateStr) {
  if (!dateStr) return 0;
  const parts = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!parts) return 0;
  const [, dd, mm, yyyy, hh, min, ss] = parts;
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`).getTime();
}

function main() {
  console.log('[MERGE] Wczytuję backup...');
  const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
  console.log('[MERGE] Backup keys:', Object.keys(backup));

  console.log('[MERGE] Wczytuję statystyki...');
  const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  console.log(`[MERGE] Znaleziono ${stats.people.length} osób w statystykach`);

  const users = backup['users.json'] || {};
  const profiles = backup['profiles.json'] || {};
  const inventory = backup['inventory.json'] || {};

  let updatedBalances = 0;
  let updatedStreaks = 0;
  let updatedInventory = 0;

  for (const person of stats.people) {
    const userId = String(person.userId);
    if (!userId) continue;

    const nearest = person.nearestStats || {};
    const user = users[userId];
    if (!user) continue;

    if (nearest.bal && nearest.bal.response) {
      const { wallet, bank } = parseBalance(nearest.bal.response);
      user.balance = wallet;
      user.bank = bank;
      updatedBalances++;
    }

    if (nearest.daily && nearest.daily.response) {
      const daily = parseDaily(nearest.daily.response);
      if (daily.day > 0) {
        user.dailyStreak = daily.day;
        user.lastDailyClaim = parseDate(nearest.daily.date);
        updatedStreaks++;
      }
    }

    if (nearest.eq && nearest.eq.response) {
      const items = {};
      const lines = nearest.eq.response.split('\n');
      for (const line of lines) {
        const match = line.match(/(\d+)\.\s*(.+?)\s*x(\d+)/);
        if (match) {
          const itemName = match[2].trim();
          const count = parseInt(match[3], 10);
          items[itemName] = count;
        }
      }
      if (Object.keys(items).length > 0) {
        if (!inventory[userId]) inventory[userId] = {};
        inventory[userId] = { ...inventory[userId], ...items };
        updatedInventory++;
      }
    }
  }

  console.log(`[MERGE] Zaktualizowano: ${updatedBalances} sald, ${updatedStreaks} daily streaków, ${updatedInventory} ekwipunków`);

  const filesToSave = {
    'users.json': users,
    'profiles.json': profiles,
    'inventory.json': inventory
  };

  for (const [fileName, data] of Object.entries(filesToSave)) {
    const targetPath = path.join(SEED_DIR, fileName);
    const backupPath = targetPath + '.bak';
    if (fs.existsSync(targetPath)) {
      fs.copyFileSync(targetPath, backupPath);
    }
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[MERGE] Zapisano: ${fileName} (${fs.statSync(targetPath).size.toLocaleString()} bytes)`);
  }

  console.log('[MERGE] Gotowe.');
}

main();
