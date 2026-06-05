const fs = require('fs');
const login = require('@dongdev/fca-unofficial');

const appState = JSON.parse(fs.readFileSync('./appstate.json', 'utf8'));

login({ appState }, (err, api) => {
  if (err) {
    console.error('Login error:', err);
    process.exit(1);
  }

  console.log('Login successful! Fetching PENDING (Message Requests) threads...');

  api.getThreadList(20, null, ['PENDING'], (err1, list1) => {
    if (err1) console.error('Error PENDING:', err1);
    
    console.log(`\n--- PENDING THREADS (Total: ${list1 ? list1.length : 0}) ---`);
    if (list1) {
      list1.forEach((t, i) => {
        const type = t.isGroup ? 'GROUP' : 'USER';
        console.log(`[${i + 1}] Type: ${type}, Name: "${t.name || 'No Name'}", ThreadID: "${t.threadID}"`);
      });
    }

    console.log('\nFetching OTHER (Spam) threads...');
    api.getThreadList(20, null, ['OTHER'], (err2, list2) => {
      if (err2) console.error('Error OTHER:', err2);
      
      console.log(`\n--- OTHER THREADS (Total: ${list2 ? list2.length : 0}) ---`);
      if (list2) {
        list2.forEach((t, i) => {
          const type = t.isGroup ? 'GROUP' : 'USER';
          console.log(`[${i + 1}] Type: ${type}, Name: "${t.name || 'No Name'}", ThreadID: "${t.threadID}"`);
        });
      }
      console.log('-----------------------------------------\n');
      process.exit(0);
    });
  });
});
