const fs = require('fs');
const login = require('@dongdev/fca-unofficial');

const appState = JSON.parse(fs.readFileSync('./appstate.json', 'utf8'));

login({ appState }, (err, api) => {
  if (err) {
    console.error('Login error:', err);
    process.exit(1);
  }

  console.log('Login successful! Fetching recent threads...');

  api.getThreadList(20, null, ['INBOX'], (threadErr, list) => {
    if (threadErr) {
      console.error('Error fetching thread list:', threadErr);
      process.exit(1);
    }

    console.log(`\n--- RECENT THREADS (Total: ${list.length}) ---`);
    list.forEach((t, i) => {
      const type = t.isGroup ? 'GROUP' : 'USER';
      console.log(`[${i + 1}] Type: ${type}, Name: "${t.name || 'No Name'}", ThreadID: "${t.threadID}"`);
    });
    console.log('-----------------------------------------\n');
    process.exit(0);
  });
});
