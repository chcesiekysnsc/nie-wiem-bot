const login = require('@dongdev/fca-unofficial');
const fs = require('fs');
const path = require('path');

const appStatePath = path.join(__dirname, '..', 'appstate.json');
if (!fs.existsSync(appStatePath)) {
  console.error('Brak appstate.json');
  process.exit(1);
}

const appState = JSON.parse(fs.readFileSync(appStatePath, 'utf8'));

login({ appState }, (err, api) => {
  if (err) {
    console.error('Login failed:', err);
    process.exit(1);
  }

  const targetId = '61560227271099'; // User's ID from cookies
  api.getUserInfo(targetId, (err, ret) => {
    if (err) {
      console.error('getUserInfo failed:', err);
    } else {
      console.log('USER INFO RESULT:');
      console.log(JSON.stringify(ret[targetId], null, 2));
    }
    process.exit(0);
  });
});
