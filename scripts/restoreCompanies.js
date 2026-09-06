const fs = require('fs');
const path = require('path');

const COMPANIES_TO_RESTORE = [
  {
    id: '100012870817390',
    name: 'Wojciech Wiśniewski',
    company: { id: 'elektrownia', boughtAt: 1788500000000, lastPayout: 1788720000000, isBroken: false },
    worker: 'eryk'
  },
  {
    id: '100011378042556',
    name: 'Eryk Kochanowski',
    company: { id: 'elektrownia', boughtAt: 1788689252000, lastPayout: 1788720000000, isBroken: false }
  },
  {
    id: '61575310766041',
    name: 'Krystian Armata',
    company: { id: 'kiosk', boughtAt: 1788698891000, lastPayout: 1788720000000, isBroken: false },
    worker: 'lary'
  },
  {
    id: '100092661122778',
    name: 'Marek Cuckerberg',
    company: { id: 'kiosk', boughtAt: 1788698511000, lastPayout: 1788720000000, isBroken: false }
  },
  {
    id: '61593974346363',
    name: 'Marek Cuckerberg',
    company: { id: 'kiosk', boughtAt: 1788642235000, lastPayout: 1788720000000, isBroken: false }
  },
  {
    id: '100089617171766',
    name: 'Zosia Zosia',
    company: { id: 'stacja_paliw', boughtAt: 1788720740000, lastPayout: 1788720740000, isBroken: false }
  },
  {
    id: '100016685764834',
    name: 'Fabian Sidwa',
    company: { id: 'stacja_paliw', boughtAt: 1788675114000, lastPayout: 1788720000000, isBroken: false }
  },
  {
    id: '61581901590549',
    name: 'Zuzia Wojciechowska Gasiecka',
    company: { id: 'stacja_paliw', boughtAt: 1788634189000, lastPayout: 1788720000000, isBroken: false }
  },
  {
    id: '61586183807953',
    name: 'Adrian Mako',
    company: { id: 'stacja_paliw', boughtAt: 1788634144000, lastPayout: 1788720000000, isBroken: false }
  },
  {
    id: '61560302049677',
    name: 'Emil Bartosiak',
    company: { id: 'stacja_paliw', boughtAt: 1788466567000, lastPayout: 1788720000000, isBroken: false }
  },
  {
    id: '100078075921094',
    name: 'Kamil Sokołowski',
    company: { id: 'stacja_paliw', boughtAt: 1788597534000, lastPayout: 1788720000000, isBroken: false }
  },
  {
    id: '100046236224568',
    name: 'Magdalena Rosik',
    company: { id: 'stacja_paliw', boughtAt: 1788500000000, lastPayout: 1788720000000, isBroken: false }
  },
  {
    id: '100089805784535',
    name: 'Bartek Litkowiec',
    company: { id: 'stacja_paliw', boughtAt: 1788500000000, lastPayout: 1788720000000, isBroken: false }
  },
  {
    id: '100060812419294',
    name: 'Rafał Oleksy',
    company: { id: 'bank', boughtAt: 1785857694112, lastPayout: 1787739653917, isBroken: false },
    worker: 'eryk'
  },
  {
    id: '100046279354282',
    name: 'Rafał Kowalski',
    company: { id: 'kiosk', boughtAt: 1785861041561, lastPayout: 1785861050088, isBroken: false }
  },
  {
    id: '100093902840911',
    name: 'Rafal Oleksy',
    company: { id: 'kiosk', boughtAt: 1785861232059, lastPayout: 1786135328294, isBroken: false }
  },
  {
    id: '100055028388595',
    name: 'Asia Jaworska',
    company: { id: 'restauracja', boughtAt: 1783193585157, lastPayout: 1783604292944, isBroken: false }
  }
];

const targetFiles = [
  path.resolve('data/users.json'),
  path.resolve('data_seed/users.json'),
  path.resolve('C:/Users/dupek/.gemini/antigravity/db_backups/users.json')
];

for (const targetPath of targetFiles) {
  if (!fs.existsSync(targetPath)) {
    console.log('File does not exist, skipping:', targetPath);
    continue;
  }

  const users = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  let updatedCount = 0;

  for (const item of COMPANIES_TO_RESTORE) {
    if (!users[item.id]) {
      console.log(`User ${item.id} (${item.name}) not found in ${targetPath}, creating shell record...`);
      users[item.id] = {
        name: item.name,
        balance: 0,
        bank: 0,
        company: null,
        company2: null,
        worker: null
      };
    }

    const u = users[item.id];
    if (!u.name && item.name) {
      u.name = item.name;
    }
    u.company = Object.assign({}, item.company);
    if (item.worker) {
      u.worker = item.worker;
      if (!u.workerHiredAt) u.workerHiredAt = item.company.boughtAt;
    }

    updatedCount++;
  }

  fs.writeFileSync(targetPath, JSON.stringify(users, null, 2), 'utf8');
  console.log(`Successfully updated ${updatedCount} users with companies in: ${targetPath}`);
}
