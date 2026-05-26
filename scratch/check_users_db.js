const fs = require('fs');

function run() {
  const dataPath = 'c:\\Users\\dupek\\Desktop\\nie mam pojecia\\data\\users.json';
  if (!fs.existsSync(dataPath)) {
    console.log('No users database file found.');
    return;
  }

  const users = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log(`Total users in database: ${Object.keys(users).length}`);

  const candidates = [];
  for (const [id, u] of Object.entries(users)) {
    candidates.push({
      id,
      commandsUsed: u.commandsUsed,
      messageCount: u.messageCount,
      isMultiAccount: u.isMultiAccount,
      commandCounts: u.commandCounts,
      multiAccountWarnings: u.multiAccountWarnings
    });
  }

  console.log('\nAll users:');
  console.log(JSON.stringify(candidates, null, 2));
}

run();
