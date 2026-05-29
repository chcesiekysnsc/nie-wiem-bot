const login = require('@dongdev/fca-unofficial');
const fs = require('fs');

const appState = JSON.parse(fs.readFileSync('appstate.json', 'utf8'));

login({ appState }, (err, api) => {
  if (err) {
    console.error('Error logging in:', err);
    process.exit(1);
  }
  
  // Test searching for Zuck's ID or similar
  const username = 'zuck';
  console.log(`Searching for username: ${username}...`);
  
  api.getUserID(username, (searchErr, data) => {
    if (searchErr) {
      console.error('Search error:', searchErr);
    } else {
      console.log('Search Result:', JSON.stringify(data, null, 2));
    }
    process.exit(0);
  });
});
