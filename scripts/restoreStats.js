const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../utils/storage');

const SEASONAL_ITEM_IDS = new Set([
  'szkarlatne_oko',
  'cien_nocy',
  'wampirzy_sztylet',
  'szwajcarski_klucz',
  'krysztal_doswiadczenia',
  'ananas_na_pizzy',
  'czarna_bandera',
  'czarna_karta',
  'kosci_oszusta',
  'czterolistna_moneta',
  'deweloper',
  'eclipse',
  'mark_of_sacrifice',
  'polityk',
  'nether_blade'
]);

function readJson(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`[RESTORE] Błąd odczytu ${fileName}:`, e.message);
    return {};
  }
}

function writeJson(fileName, data) {
  const filePath = path.join(DATA_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`[RESTORE] Zapisano: ${fileName} (${fs.statSync(filePath).size.toLocaleString()} bytes)`);
}

function main() {
  console.log('[RESTORE] Wczytuję dane bieżące...');
  const currentUsers = readJson('users.json');
  const currentProfiles = readJson('profiles.json');
  const currentInventory = readJson('inventory.json');

  console.log('[RESTORE] Wczytuję backup z data_seed...');
  const seedDir = path.join(__dirname, '..', 'data_seed');
  const seedUsers = fs.existsSync(path.join(seedDir, 'users.json'))
    ? JSON.parse(fs.readFileSync(path.join(seedDir, 'users.json'), 'utf8'))
    : {};
  const seedProfiles = fs.existsSync(path.join(seedDir, 'profiles.json'))
    ? JSON.parse(fs.readFileSync(path.join(seedDir, 'profiles.json'), 'utf8'))
    : {};

  const allUserIds = new Set([
    ...Object.keys(currentUsers),
    ...Object.keys(seedUsers)
  ]);

  let mergedUsers = {};
  for (const userId of allUserIds) {
    const current = currentUsers[userId];
    const backup = seedUsers[userId];

    if (current) {
      const merged = { ...current };
      if (backup) {
        for (const [key, value] of Object.entries(backup)) {
          if (key === 'balance' || key === 'bank') continue;
          if (merged[key] === undefined || merged[key] === null || merged[key] === '') {
            merged[key] = value;
          }
        }
      }
      merged.balance = 5000;
      merged.bank = 10000;
      mergedUsers[userId] = merged;
    } else if (backup) {
      const merged = { ...backup };
      merged.balance = 5000;
      merged.bank = 10000;
      mergedUsers[userId] = merged;
    }
  }

  const mergedProfiles = { ...seedProfiles };
  if (mergedProfiles.gangs) {
    for (const gangId of Object.keys(mergedProfiles.gangs)) {
      mergedProfiles.gangs[gangId].vault = 0;
      if (!mergedProfiles.gangs[gangId].deposits) {
        mergedProfiles.gangs[gangId].deposits = {};
      }
    }
  }

  const mergedInventory = {};
  for (const userId of Object.keys(currentInventory)) {
    const userInv = currentInventory[userId] || {};
    const filtered = {};
    for (const [itemId, count] of Object.entries(userInv)) {
      if (SEASONAL_ITEM_IDS.has(itemId)) {
        filtered[itemId] = count;
      }
    }
    if (Object.keys(filtered).length > 0) {
      mergedInventory[userId] = filtered;
    }
  }

  const stats = {
    users: mergedUsers,
    profiles: mergedProfiles,
    inventory: mergedInventory
  };

  console.log(`[RESTORE] Podsumowanie:`);
  console.log(`  - Użytkowników: ${Object.keys(mergedUsers).length}`);
  console.log(`  - Gangów: ${Object.keys(mergedProfiles.gangs || {}).length}`);
  console.log(`  - Ekwipunków z przedmiotami sezonowymi: ${Object.keys(mergedInventory).length}`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputDir = path.join(DATA_DIR, 'restore_output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const [fileName, data] of Object.entries(stats)) {
    const outputPath = path.join(outputDir, `${fileName}_${timestamp}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[RESTORE] Zapisano: ${outputPath}`);
  }

  console.log('[RESTORE] Gotowe.');
}

main();
