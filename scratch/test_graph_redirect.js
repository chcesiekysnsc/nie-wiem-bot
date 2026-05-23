const https = require('https');
const fs = require('fs');
const path = require('path');

const appStatePath = path.join(__dirname, '..', 'appstate.json');
if (!fs.existsSync(appStatePath)) {
  console.error('Brak appstate.json');
  process.exit(1);
}

const appState = JSON.parse(fs.readFileSync(appStatePath, 'utf8'));

// Format cookies as a Cookie header string
const cookieHeader = appState.map(c => `${c.key}=${c.value}`).join('; ');

const targetId = '61560227271099';
const url = `https://graph.facebook.com/${targetId}/picture?width=500&height=500`;

function getRedirect(url, headers = {}) {
  return new Promise((resolve) => {
    https.get(url, { headers }, (res) => {
      console.log(`URL: ${url}`);
      console.log(`Status: ${res.statusCode}`);
      console.log(`Location: ${res.headers.location}`);
      console.log('---');
      resolve(res.headers.location);
    }).on('error', (err) => {
      console.error(err);
      resolve(null);
    });
  });
}

async function run() {
  console.log('1. Fetching WITHOUT cookies:');
  const locWithout = await getRedirect(url);

  console.log('2. Fetching WITH cookies:');
  const locWith = await getRedirect(url, {
    'Cookie': cookieHeader,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
}

run();
