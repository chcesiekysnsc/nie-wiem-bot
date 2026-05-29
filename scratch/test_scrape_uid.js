const login = require('@dongdev/fca-unofficial');
const fs = require('fs');

const appState = JSON.parse(fs.readFileSync('appstate.json', 'utf8'));

login({ appState }, (err, api) => {
  if (err) {
    console.error('Error logging in:', err);
    process.exit(1);
  }
  
  const username = 'zuck';
  const url = `https://mbasic.facebook.com/${username}`;
  console.log(`Fetching: ${url}...`);
  
  api.httpGet(url, (getErr, html) => {
    if (getErr) {
      console.error('Fetch error:', getErr);
      process.exit(1);
    }
    
    // Look for patterns like ?owner_id=1000... or id=1000... or fb://profile/1000...
    // Let's print matches
    const idMatches = [];
    
    // Pattern 1: profile_id
    const regex1 = /"profile_id":\s*(\d+)/g;
    let m;
    while ((m = regex1.exec(html)) !== null) {
      idMatches.push({ source: 'profile_id', id: m[1] });
    }
    
    // Pattern 2: /messages/thread/(\d+)
    const regex2 = /\/messages\/thread\/(\d+)/g;
    while ((m = regex2.exec(html)) !== null) {
      idMatches.push({ source: 'messages_thread', id: m[1] });
    }
    
    // Pattern 3: owner_id=(\d+)
    const regex3 = /owner_id=(\d+)/g;
    while ((m = regex3.exec(html)) !== null) {
      idMatches.push({ source: 'owner_id', id: m[1] });
    }

    // Pattern 4: target=(\d+)
    const regex4 = /target=(\d+)/g;
    while ((m = regex4.exec(html)) !== null) {
      idMatches.push({ source: 'target', id: m[1] });
    }
    
    // Pattern 5: fb://profile/(\d+)
    const regex5 = /fb:\/\/profile\/(\d+)/g;
    while ((m = regex5.exec(html)) !== null) {
      idMatches.push({ source: 'fb_profile', id: m[1] });
    }
    
    console.log('HTML length:', html.length);
    console.log('Matches found:', idMatches);
    
    // Let's write html to a file to inspect if needed
    fs.writeFileSync('scratch/profile.html', html);
    
    process.exit(0);
  });
});
