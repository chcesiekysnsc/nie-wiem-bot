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

  const targetId = '61560227271099';
  const profileUrl = `https://www.facebook.com/profile.php?id=${targetId}`;

  console.log(`Fetching profile page: ${profileUrl}`);
  api.httpGet(profileUrl, (err, html) => {
    if (err) {
      console.error('Failed to fetch profile page:', err);
      process.exit(1);
    }

    console.log(`Fetched HTML of size ${html.length} bytes.`);
    fs.writeFileSync(path.join(__dirname, 'profile.html'), html, 'utf8');
    
    // Let's find all scontent urls in the html
    const scontentRegex = /https:\/\/scontent[^"'\\]+/g;
    const matches = html.match(scontentRegex) || [];
    
    console.log(`Found ${matches.length} scontent URLs:`);
    const unique = [...new Set(matches)];
    console.log(`Unique scontent URLs count: ${unique.length}`);
    
    // Print URLs that might be the avatar (often containing profile/t39/100x100 or larger)
    unique.forEach((url, index) => {
      // Decode escaped slashes or characters
      let cleanUrl = url.replace(/\\/g, '');
      if (cleanUrl.includes('t39.30808-1') || cleanUrl.includes('t1.30497-1') || cleanUrl.includes('profile')) {
        console.log(`[${index}] ${cleanUrl.slice(0, 150)}...`);
      }
    });

    process.exit(0);
  });
});
