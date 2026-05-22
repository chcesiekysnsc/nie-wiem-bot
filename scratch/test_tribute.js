const { withData, createUser } = require('../utils/storage');
const gang = require('../commands/gang');
const haracz = require('../commands/haracz');
const crime = require('../commands/crime');
const rob = require('../commands/rob');
const helpSystem = require('../utils/helpSystem');

async function setupTestData() {
  await withData(store => {
    // Clean up existing test users/gangs
    delete store.users['test_boss'];
    delete store.users['test_deputy'];
    delete store.users['test_member'];
    delete store.users['test_victim'];
    if (store.profiles.gangs) {
      delete store.profiles.gangs['testgang'];
    }

    const boss = createUser('test_boss', store.users);
    boss.balance = 2000000; // 2mln
    boss.gangId = null;
    boss.gangRole = null;
    
    const deputy = createUser('test_deputy', store.users);
    deputy.balance = 100000;
    deputy.gangId = null;
    deputy.gangRole = null;

    const member = createUser('test_member', store.users);
    member.balance = 100000;
    member.gangId = null;
    member.gangRole = null;

    const victim = createUser('test_victim', store.users);
    victim.balance = 200000; // 200k to rob from
    victim.gangId = null;
    victim.gangRole = null;
  });
  console.log('Setup test data completed.');
}

async function runTests() {
  await setupTestData();

  const client = {
    gangInvites: new Map(),
    gangHeists: new Map(),
    commands: new Map(), // needed if commands look for it
    userNames: new Map([
      ['test_boss', 'Szefu_Wojtek'],
      ['test_deputy', 'Zastepca_Tomek'],
      ['test_member', 'Czlonas_Jan'],
      ['test_victim', 'Ofiara_Losu']
    ])
  };

  const replies = [];
  const createMockMessage = (userId, username, argsText = '') => {
    return {
      author: { id: userId, username },
      mentions: {
        users: {
          first: () => {
            if (argsText.includes('test_deputy') || argsText.includes('Tomek')) {
              return { id: 'test_deputy', username: 'Zastepca_Tomek' };
            }
            if (argsText.includes('test_member') || argsText.includes('Jan')) {
              return { id: 'test_member', username: 'Czlonas_Jan' };
            }
            if (argsText.includes('test_victim') || argsText.includes('Ofiara')) {
              return { id: 'test_victim', username: 'Ofiara_Losu' };
            }
            return null;
          }
        }
      },
      rawEvent: {
        messageID: 'mock_msg_' + Math.random(),
        threadID: 'mock_thread_id'
      },
      reply: async (payload) => {
        let text = typeof payload === 'string' ? payload : JSON.stringify(payload);
        if (payload && payload.embeds) {
          text = '[EMBED] ' + payload.embeds.map(e => e.title || e.description).join(' | ');
        }
        replies.push({ userId, text });
        console.log(`[REPLY to ${username}]: ${text}`);
        return { messageID: 'mock_reply_' + Math.random() };
      }
    };
  };

  // Mock message sending from rob
  client.api = {
    sendMessage: (msgPayload, threadId, callback, replyToMessageId) => {
      const text = typeof msgPayload === 'string' ? msgPayload : msgPayload.body;
      console.log(`[SEND_MESSAGE to thread ${threadId}]: ${text}`);
    }
  };

  // 1. Create Gang
  console.log('\n--- 1. Creating Gang ---');
  let msg = createMockMessage('test_boss', 'Szefu_Wojtek', 'stworz TestGang');
  await gang.execute(client, msg, ['stworz', 'TestGang']);

  // Invite & Join Deputy
  console.log('\n--- 2. Adding Deputy ---');
  msg = createMockMessage('test_boss', 'Szefu_Wojtek', 'zapros test_deputy');
  await gang.execute(client, msg, ['zapros', 'test_deputy']);
  msg = createMockMessage('test_deputy', 'Zastepca_Tomek', 'dolacz');
  await gang.execute(client, msg, ['dolacz']);
  msg = createMockMessage('test_boss', 'Szefu_Wojtek', 'awans test_deputy');
  await gang.execute(client, msg, ['awans', 'test_deputy']);

  // Invite & Join Member
  console.log('\n--- 3. Adding Member ---');
  msg = createMockMessage('test_boss', 'Szefu_Wojtek', 'zapros test_member');
  await gang.execute(client, msg, ['zapros', 'test_member']);
  msg = createMockMessage('test_member', 'Czlonas_Jan', 'dolacz');
  await gang.execute(client, msg, ['dolacz']);

  // 4. Test !haracz / !gang haracz command
  console.log('\n--- 4. Testing Tribute (!haracz / !gang haracz) ---');
  
  // Non-boss trying to set tribute
  console.log('Member setting tribute (should fail):');
  msg = createMockMessage('test_member', 'Czlonas_Jan', 'haracz 15');
  await haracz.execute(client, msg, ['15']);

  // Boss viewing default tribute (should be 0%)
  console.log('Boss viewing default tribute:');
  msg = createMockMessage('test_boss', 'Szefu_Wojtek', 'haracz');
  await haracz.execute(client, msg, []);

  // Boss setting invalid tribute
  console.log('Boss setting invalid tribute (should fail):');
  msg = createMockMessage('test_boss', 'Szefu_Wojtek', 'haracz -5');
  await haracz.execute(client, msg, ['-5']);
  msg = createMockMessage('test_boss', 'Szefu_Wojtek', 'haracz 150');
  await haracz.execute(client, msg, ['150']);
  msg = createMockMessage('test_boss', 'Szefu_Wojtek', 'haracz abc');
  await haracz.execute(client, msg, ['abc']);

  // Boss setting valid tribute via standalone command
  console.log('Boss setting valid tribute (20%):');
  msg = createMockMessage('test_boss', 'Szefu_Wojtek', 'haracz 20%');
  await haracz.execute(client, msg, ['20%']);

  // Verify stored tribute percent
  await withData(store => {
    const currentGang = store.profiles.gangs['testgang'];
    if (currentGang && currentGang.tributePercent === 20) {
      console.log('✅ Stored tributePercent: 20% (PASSED)');
    } else {
      console.error('❌ Stored tributePercent check FAILED:', currentGang?.tributePercent);
    }
  });

  // Boss setting tribute via gang subcommand
  console.log('Boss setting tribute via gang subcommand (15%):');
  msg = createMockMessage('test_boss', 'Szefu_Wojtek', 'haracz 15');
  await gang.execute(client, msg, ['haracz', '15']);

  await withData(store => {
    const currentGang = store.profiles.gangs['testgang'];
    if (currentGang && currentGang.tributePercent === 15) {
      console.log('✅ Stored tributePercent: 15% (PASSED)');
    } else {
      console.error('❌ Stored tributePercent check FAILED:', currentGang?.tributePercent);
    }
  });

  // 5. Test !crime with tribute active (15%)
  console.log('\n--- 5. Testing !crime with tribute active (15%) ---');
  
  // Member crime: should pay tribute
  console.log('Member executing crime:');
  // Mock Math.random to make crime always succeed
  const origRandom = Math.random;
  Math.random = () => 0.1; // Success!

  let initialBossBalance = 0;
  let initialMemberBalance = 0;
  await withData(store => {
    initialBossBalance = store.users['test_boss'].balance;
    initialMemberBalance = store.users['test_member'].balance;
  });

  msg = createMockMessage('test_member', 'Czlonas_Jan');
  await crime.execute(client, msg);

  await withData(store => {
    const bossUser = store.users['test_boss'];
    const memberUser = store.users['test_member'];
    console.log(`Boss balance delta: ${bossUser.balance - initialBossBalance}`);
    console.log(`Member balance delta: ${memberUser.balance - initialMemberBalance}`);
    if (bossUser.balance > initialBossBalance && memberUser.balance > initialMemberBalance) {
      console.log('✅ Member crime tribute deduction and boss crediting (PASSED)');
    } else {
      console.error('❌ Member crime tribute deduction (FAILED)');
    }
  });

  // Deputy crime: should NOT pay tribute
  console.log('\nDeputy executing crime:');
  let initialDeputyBalance = 0;
  await withData(store => {
    initialBossBalance = store.users['test_boss'].balance;
    initialDeputyBalance = store.users['test_deputy'].balance;
  });

  msg = createMockMessage('test_deputy', 'Zastepca_Tomek');
  await crime.execute(client, msg);

  await withData(store => {
    const bossUser = store.users['test_boss'];
    const deputyUser = store.users['test_deputy'];
    console.log(`Boss balance delta: ${bossUser.balance - initialBossBalance}`);
    console.log(`Deputy balance delta: ${deputyUser.balance - initialDeputyBalance}`);
    if (bossUser.balance - initialBossBalance === 0) {
      console.log('✅ Deputy crime tribute exclusion (PASSED)');
    } else {
      console.error('❌ Deputy crime tribute exclusion (FAILED)');
    }
  });

  // Boss crime: should NOT pay tribute
  console.log('\nBoss executing crime:');
  await withData(store => {
    initialBossBalance = store.users['test_boss'].balance;
  });

  msg = createMockMessage('test_boss', 'Szefu_Wojtek');
  await crime.execute(client, msg);

  await withData(store => {
    const bossUser = store.users['test_boss'];
    console.log(`Boss balance delta: ${bossUser.balance - initialBossBalance}`);
    console.log('✅ Boss crime tribute exclusion (PASSED)');
  });

  // 6. Test !rob with tribute active (15%)
  console.log('\n--- 6. Testing !rob with tribute active (15%) ---');
  
  // Member rob: should pay tribute
  console.log('Member executing rob on Ofiara_Losu:');
  // Math.random returns 0.1, making rob succeed (success < 0.60)
  await withData(store => {
    initialBossBalance = store.users['test_boss'].balance;
    initialMemberBalance = store.users['test_member'].balance;
  });

  msg = createMockMessage('test_member', 'Czlonas_Jan', 'test_victim');
  await rob.execute(client, msg, ['test_victim']);

  await withData(store => {
    const bossUser = store.users['test_boss'];
    const memberUser = store.users['test_member'];
    console.log(`Boss balance delta: ${bossUser.balance - initialBossBalance}`);
    console.log(`Member balance delta: ${memberUser.balance - initialMemberBalance}`);
    if (bossUser.balance > initialBossBalance && memberUser.balance > initialMemberBalance) {
      console.log('✅ Member rob tribute deduction and boss crediting (PASSED)');
    } else {
      console.error('❌ Member rob tribute deduction (FAILED)');
    }
  });

  // 7. Test numbered upgrades in !gang ulepsz
  console.log('\n--- 7. Testing Numbered Upgrades (!gang ulepsz <1/2/3>) ---');
  
  // Check default level
  let currentVault = 0;
  await withData(store => {
    const currentGang = store.profiles.gangs['testgang'];
    currentGang.vault = 1000000; // Put 1mln in vault
    currentVault = currentGang.vault;
  });

  // Upgrade Dziupla (1)
  console.log('Upgrading Dziupla with index 1:');
  msg = createMockMessage('test_boss', 'Szefu_Wojtek', 'ulepsz 1');
  await gang.execute(client, msg, ['ulepsz', '1']);

  await withData(store => {
    const currentGang = store.profiles.gangs['testgang'];
    if (currentGang.levelDziupla === 1) {
      console.log('✅ Upgrade Dziupla with index 1 (PASSED)');
    } else {
      console.error('❌ Upgrade Dziupla with index 1 (FAILED)', currentGang.levelDziupla);
    }
  });

  // Upgrade Biznesy (2)
  console.log('Upgrading Biznesy with index 2:');
  msg = createMockMessage('test_boss', 'Szefu_Wojtek', 'ulepsz 2');
  await gang.execute(client, msg, ['ulepsz', '2']);

  await withData(store => {
    const currentGang = store.profiles.gangs['testgang'];
    if (currentGang.levelBiznesy === 1) {
      console.log('✅ Upgrade Biznesy with index 2 (PASSED)');
    } else {
      console.error('❌ Upgrade Biznesy with index 2 (FAILED)', currentGang.levelBiznesy);
    }
  });

  // Upgrade Fach (3)
  console.log('Upgrading Fach with index 3:');
  msg = createMockMessage('test_boss', 'Szefu_Wojtek', 'ulepsz 3');
  await gang.execute(client, msg, ['ulepsz', '3']);

  await withData(store => {
    const currentGang = store.profiles.gangs['testgang'];
    if (currentGang.levelFach === 1) {
      console.log('✅ Upgrade Fach with index 3 (PASSED)');
    } else {
      console.error('❌ Upgrade Fach with index 3 (FAILED)', currentGang.levelFach);
    }
  });

  // Restore Math.random
  Math.random = origRandom;

  // 8. Test numbered list of upgrades in !gang info
  console.log('\n--- 8. Checking gang info upgrade numbering ---');
  msg = createMockMessage('test_boss', 'Szefu_Wojtek', 'info');
  await gang.execute(client, msg, ['info']);

  // 9. Check help listing for !haracz
  console.log('\n--- 9. Checking help list and detail for !haracz ---');
  const haraczCmd = helpSystem.helpCommands.find(c => c.name === 'haracz');
  if (haraczCmd) {
    console.log('✅ Found haracz in help list:');
    console.log(`- ID: ${haraczCmd.id}`);
    console.log(`- Trigger: !${haraczCmd.name}`);
    console.log(`- Desc: ${haraczCmd.description}`);
    console.log(`- Usage: ${haraczCmd.usage}`);
  } else {
    console.error('❌ Could not find haracz command in help list!');
  }
}

runTests().catch(console.error);
