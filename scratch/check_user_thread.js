const fs = require('fs');
const login = require('@dongdev/fca-unofficial');

const appState = JSON.parse(fs.readFileSync('./appstate.json', 'utf8'));

login({ appState }, (err, api) => {
  if (err) {
    console.error('Login error:', err);
    process.exit(1);
  }

  const user1 = '100060812419294'; // Admin/Owner
  const user2 = '100071703912091'; // User who tested mafia
  
  console.log(`Login successful! Fetching user info for ${user1} and ${user2}...`);

  api.getUserInfo([user1, user2], (infoErr, info) => {
    if (infoErr) {
      console.error('Error fetching user info:', infoErr);
    } else {
      console.log('\n--- USER INFO ---');
      console.log(JSON.stringify(info, null, 2));
    }

    console.log(`\nFetching thread info for private thread with ${user1}...`);
    api.getThreadInfo(user1, (threadErr1, tInfo1) => {
      if (threadErr1) {
        console.error(`Error fetching thread info for ${user1}:`, threadErr1);
      } else {
        console.log(`\n--- THREAD INFO FOR ${user1} ---`);
        console.log(JSON.stringify(tInfo1, null, 2));
      }

      console.log(`\nFetching thread info for private thread with ${user2}...`);
      api.getThreadInfo(user2, (threadErr2, tInfo2) => {
        if (threadErr2) {
          console.error(`Error fetching thread info for ${user2}:`, threadErr2);
        } else {
          console.log(`\n--- THREAD INFO FOR ${user2} ---`);
          console.log(JSON.stringify(tInfo2, null, 2));
        }
        process.exit(0);
      });
    });
  });
});
