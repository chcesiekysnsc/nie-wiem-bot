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

  // Check where we might find access_token, dtsg, or cookies
  console.log('api.access_token:', api.access_token);
  console.log('api.fb_dtsg:', api.fb_dtsg);
  console.log('api.getCurrentUserID():', api.getCurrentUserID());

  // Let's check internal state
  const keys = Object.keys(api);
  console.log('Checking keys for tokens:');
  for (const k of keys) {
    if (k.toLowerCase().includes('token') || k.toLowerCase().includes('dtsg') || k.toLowerCase().includes('ctx') || k.toLowerCase().includes('state')) {
      console.log(`- api.${k}:`, api[k]);
    }
  }

  process.exit(0);
});
