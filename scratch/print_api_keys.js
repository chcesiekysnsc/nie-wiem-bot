const login = require('@dongdev/fca-unofficial');
const fs = require('fs');
const path = require('path');

const appStatePath = path.join(__dirname, '..', 'appstate.json');
const appState = JSON.parse(fs.readFileSync(appStatePath, 'utf8'));

login({ appState }, (err, api) => {
  if (err) {
    console.error('Login failed:', err);
    process.exit(1);
  }

  console.log('API keys:');
  const keys = Object.keys(api).sort();
  for (const k of keys) {
    console.log(`- ${k} (${typeof api[k]})`);
  }
  
  if (api.users) {
    console.log('API.users keys:');
    const uKeys = Object.keys(api.users).sort();
    for (const k of uKeys) {
      console.log(`  - users.${k} (${typeof api.users[k]})`);
    }
  }

  process.exit(0);
});
