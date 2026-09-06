const fs = require('fs');

const dump = fs.readFileSync('C:/Users/dupek/Downloads/file-1788729864683', 'utf8');
const msgs = JSON.parse(dump);
const users = JSON.parse(fs.readFileSync('data/users.json', 'utf8'));

const WIPE_TS = 1788722500000;

// Track company actions by user
const actions = {};

function addAction(uid, act) {
  if (!actions[uid]) actions[uid] = [];
  actions[uid].push(act);
}

for (let i = 0; i < msgs.length; i++) {
  const m = msgs[i];
  if (m.ts > WIPE_TS) continue;
  const b = m.body || '';

  // Check if bot confirmed a purchase
  if (b.includes('Pomyślnie kupiono firmę')) {
    const prev = msgs[i - 1];
    const uid = prev?.senderID;
    const match = b.match(/Pomyślnie kupiono firmę:\s*\*\*([^\*]+)\*\*/);
    addAction(uid, { type: 'BUY', comp: match ? match[1] : b, date: m.date, ts: m.ts });
  }

  // Check if bot confirmed a sale
  if (b.includes('Sprzedano firmę')) {
    const prev = msgs[i - 1];
    const uid = prev?.senderID;
    const match = b.match(/Sprzedano firmę\s*\*\*([^\*]+)\*\*/);
    addAction(uid, { type: 'SELL', comp: match ? match[1] : b, date: m.date, ts: m.ts });
  }

  // Check !firma zbierz cooldown or success
  if (b.includes('!firma zbierz') && b.includes('(')) {
    const prev = msgs[i - 1];
    const uid = prev?.senderID;
    const match = b.match(/\(([^\)]+)\)/);
    if (match && !match[1].includes('Dzień') && !match[1].includes('!')) {
      addAction(uid, { type: 'COOLDOWN_MENTION', comp: match[1], date: m.date, ts: m.ts });
    }
  }

  // Check !firma overview
  if (b.includes('TWOJE PRZEDSIĘBIORSTWA')) {
    const prev = msgs[i - 1];
    const uid = prev?.senderID;
    const match = b.match(/FIRMA:\*\*\s*([^\n]+)/);
    if (match) {
      addAction(uid, { type: 'OVERVIEW', comp: match[1], date: m.date, ts: m.ts });
    }
  }
}

console.log('Detected user company interactions:');
for (const [uid, list] of Object.entries(actions)) {
  const name = users[uid]?.name || uid;
  console.log(`\nUser: ${name} (${uid})`);
  list.forEach(a => console.log(`  [${a.date}] ${a.type}: ${a.comp}`));
}
