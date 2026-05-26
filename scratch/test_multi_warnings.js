const { withData, createUser } = require('../utils/storage');

async function run() {
  const testUser = 'trace_user_id';

  // Reset database for test user
  await withData(store => {
    delete store.users[testUser];
  });

  const runCmd = async (cmdName) => {
    await withData(store => {
      const u = createUser(testUser, store.users);
      u.commandCounts = u.commandCounts || {};

      const totalCommands = (u.commandsUsed || 0) + 1;
      const normalMessages = u.messageCount || 0;
      const workCount = (u.commandCounts['work'] || 0) + (cmdName === 'work' ? 1 : 0);
      const crimeCount = (u.commandCounts['crime'] || 0) + (cmdName === 'crime' ? 1 : 0);
      const dailyCount = (u.commandCounts['daily'] || 0) + (cmdName === 'daily' ? 1 : 0);
      const tipCount = (u.commandCounts['tip'] || 0) + (cmdName === 'tip' ? 1 : 0);
      const earningsCount = workCount + crimeCount + dailyCount + tipCount;

      let isBlocked = false;
      let action = 'none';

      if (u.isMultiAccount) {
        action = 'blocked_multiaccount';
        isBlocked = true;
      } else {
        if (totalCommands >= 10) {
          const isMostlyEarnings = (earningsCount / totalCommands) >= 0.80;
          if (isMostlyEarnings) {
            u.multiAccountWarnings = (u.multiAccountWarnings || 0) + 1;
            action = `warning_incremented_to_${u.multiAccountWarnings}`;
            if (u.multiAccountWarnings >= 4 || totalCommands >= 13) {
              u.isMultiAccount = true;
              u.unblockMessageTarget = (u.messageCount || 0) + 100;
              isBlocked = true;
              action = `banned_at_total_${totalCommands}_warnings_${u.multiAccountWarnings}`;
            }
          } else {
            u.multiAccountWarnings = 0;
            action = 'warning_reset_mostly_earnings_false';
          }
        } else {
          action = 'too_few_commands_no_check';
        }

        if (!isBlocked) {
          u.commandsUsed = totalCommands;
          u.commandCounts[cmdName] = (u.commandCounts[cmdName] || 0) + 1;
        }
      }

      console.log(`Command ${totalCommands} (${cmdName}): earningsCount=${earningsCount}, ratio=${(earningsCount / totalCommands).toFixed(2)}, warnings=${u.multiAccountWarnings}, isMultiAccount=${u.isMultiAccount}, action=${action}`);
    });
  };

  for (let i = 1; i <= 15; i++) {
    await runCmd('work');
  }

  // Cleanup
  await withData(store => {
    delete store.users[testUser];
  });
}

run().catch(console.error);
