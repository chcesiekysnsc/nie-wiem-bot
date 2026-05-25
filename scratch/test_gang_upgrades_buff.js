const { withData, createUser } = require('../utils/storage');
const gang = require('../commands/gang');
const crime = require('../commands/crime');
const rob = require('../commands/rob');

async function setupTestData() {
  await withData(store => {
    delete store.users['user_boss_1'];
    delete store.users['user_victim_1'];
    if (store.profiles.gangs) {
      delete store.profiles.gangs['gangtestowy'];
    }

    const boss = createUser('user_boss_1', store.users);
    boss.balance = 2500000;
    
    const victim = createUser('user_victim_1', store.users);
    victim.balance = 1000000;
  });
  console.log('Setup test data completed.');
}

async function runTests() {
  await setupTestData();

  const client = {
    gangInvites: new Map(),
    gangHeists: new Map(),
    userNames: new Map([
      ['user_boss_1', 'Boss_Wojtek'],
      ['user_victim_1', 'Victim_John']
    ])
  };

  let lastReply = '';
  const createMockMessage = (userId, username, argsText = '') => {
    return {
      author: { id: userId, username },
      mentions: {
        users: {
          first: () => {
            if (argsText.includes('user_victim_1')) {
              return { id: 'user_victim_1', username: 'Victim_John' };
            }
            return null;
          }
        }
      },
      reply: async (payload) => {
        lastReply = typeof payload === 'string' ? payload : JSON.stringify(payload);
        return { messageID: 'mock_msg_' + Math.random() };
      }
    };
  };

  // 1. Create Gang
  console.log('\n--- 1. Creating Gang ---');
  let msg = createMockMessage('user_boss_1', 'Boss_Wojtek');
  await gang.execute(client, msg, ['stworz', 'GangTestowy']);

  // 2. Check !gang info output showing costs
  console.log('\n--- 2. Checking !gang info for upgrade costs (Lvl 0) ---');
  await gang.execute(client, msg, ['info']);
  console.log(lastReply);
  if (lastReply.includes('Dziupla') && lastReply.includes('100') && lastReply.includes('Biznesy') && lastReply.includes('200') && lastReply.includes('Fach') && lastReply.includes('200')) {
    console.log('✅ PASS: !gang info contains Lvl 0 upgrade costs.');
  } else {
    console.log('❌ FAIL: !gang info does not contain correct Lvl 0 costs.');
  }

  // 3. Check !gang ulepsz error message for personalized upgrade costs
  console.log('\n--- 3. Checking !gang ulepsz usage costs (Lvl 0) ---');
  await gang.execute(client, msg, ['ulepsz']);
  console.log(lastReply);
  if (lastReply.includes('Dziupla') && lastReply.includes('100') && lastReply.includes('Biznesy') && lastReply.includes('200') && lastReply.includes('Fach') && lastReply.includes('200')) {
    console.log('✅ PASS: !gang ulepsz shows Lvl 0 upgrade costs.');
  } else {
    console.log('❌ FAIL: !gang ulepsz does not show Lvl 0 costs.');
  }

  // Deposit money and upgrade Fach to Lvl 1
  console.log('\n--- 4. Upgrading Fach to Level 1 ---');
  await gang.execute(client, msg, ['wplac', '1000000']);
  await gang.execute(client, msg, ['ulepsz', 'fach']);
  console.log(lastReply);

  // Check !gang info shows Lvl 1 cost for Fach (350 000) and +4%
  console.log('\n--- 5. Checking info after Fach Lvl 1 upgrade ---');
  await gang.execute(client, msg, ['info']);
  console.log(lastReply);
  if (lastReply.includes('+4%') && lastReply.includes('350')) {
    console.log('✅ PASS: !gang info shows +4% and 350k cost for next Fach upgrade.');
  } else {
    console.log('❌ FAIL: !gang info check after upgrade failed.');
  }

  // 6. Upgrade Fach to Level 2 and Level 3
  console.log('\n--- 6. Upgrading Fach to Level 2 and Level 3 ---');
  await gang.execute(client, msg, ['ulepsz', 'fach']); // Lvl 2: costs 350k
  await withData(store => {
    store.profiles.gangs['gangtestowy'].vault += 600000; // Add cash for Lvl 3
  });
  await gang.execute(client, msg, ['ulepsz', 'fach']); // Lvl 3: costs 600k

  // Check !gang info shows Lvl 3 (Maks. poziom) and +12%
  console.log('\n--- 7. Checking info after Fach Lvl 3 upgrade ---');
  await gang.execute(client, msg, ['info']);
  console.log(lastReply);
  if (lastReply.includes('+12%') && lastReply.includes('Maks. poziom')) {
    console.log('✅ PASS: !gang info shows +12% and "Maks. poziom" for Fach.');
  } else {
    console.log('❌ FAIL: !gang info check for Max level Fach failed.');
  }

  // Cleanup DB
  await withData(store => {
    delete store.users['user_boss_1'];
    delete store.users['user_victim_1'];
    if (store.profiles.gangs) {
      delete store.profiles.gangs['gangtestowy'];
    }
  });

  console.log('\n=== UNIT TESTS COMPLETED ===');
}

runTests().catch(console.error);
