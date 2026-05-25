const { withData, createUser } = require('../utils/storage');
const economy = require('../utils/economy');
const gangCmd = require('../commands/gang');
const tipCmd = require('../commands/tip');
const config = require('../config/config');

const TEST_USER = 'multi_test_user_id';
const TEST_GANG_1 = 'test_gang_id_1';
const TEST_GANG_2 = 'test_gang_id_2';
const BYPASS_TEST_USER = '61562475523609';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

function mockMessage(userId, content = '', commandName = '') {
  let replyMsg = '';
  return {
    author: { id: userId, username: 'TestUser' },
    guild: { id: 'test_thread' },
    rawEvent: { threadID: 'test_thread', messageID: 'msg_' + Math.random() },
    content,
    mentions: { users: { first: () => null } },
    reply: async (text) => {
      replyMsg = typeof text === 'string' ? text : JSON.stringify(text);
    },
    getReply: () => replyMsg
  };
}

function checkIfRestricted(commandName, args) {
  const restrictedCommands = ['daily', 'rob', 'crime', 'work', 'tip', 'marry', 'rozwod', 'duel', 'rynek'];
  if (restrictedCommands.includes(commandName)) {
    return true;
  }
  if (commandName === 'gang') {
    const sub = String(args[0] || '').toLowerCase();
    const restrictedGangSubs = ['skok', 'dolacz', 'zapros', 'atak', 'wojna'];
    if (restrictedGangSubs.includes(sub)) {
      return true;
    }
  }
  return false;
}

async function simulateCommand(client, userId, commandName, args = []) {
  const command = { name: commandName };
  const message = mockMessage(userId, '', commandName);
  
  let isBlocked = false;
  await withData(store => {
    const u = createUser(userId, store.users);
    u.commandCounts = u.commandCounts || {};

    const bypassIds = [
      '100060812419294',
      '100014929176652',
      '61562475523609',
      '615792123922351',
      '100093902840911',
      '100046279354282',
      '61571684725864',
      ...config.admins
    ];

    if (!bypassIds.includes(userId)) {
      if (u.isMultiAccount) {
        let canUnblock = false;
        if (u.unblockMessageTarget !== undefined && u.unblockMessageTarget !== null) {
          if ((u.messageCount || 0) >= u.unblockMessageTarget) {
            canUnblock = true;
          }
        } else {
          if ((u.messageCount || 0) >= (u.commandsUsed || 0)) {
            canUnblock = true;
          }
        }

        if (canUnblock) {
          u.isMultiAccount = false;
          delete u.unblockMessageTarget;
          u.commandsUsed = (u.commandsUsed || 0) + 1;
          u.commandCounts[command.name] = (u.commandCounts[command.name] || 0) + 1;
        } else {
          const isRestricted = checkIfRestricted(command.name, args);
          if (isRestricted) {
            isBlocked = true;
          }
        }
      } else {
        const totalCommands = (u.commandsUsed || 0) + 1;
        const normalMessages = u.messageCount || 0;
        const workCount = (u.commandCounts['work'] || 0) + (command.name === 'work' ? 1 : 0);
        const crimeCount = (u.commandCounts['crime'] || 0) + (command.name === 'crime' ? 1 : 0);
        const dailyCount = (u.commandCounts['daily'] || 0) + (command.name === 'daily' ? 1 : 0);
        const tipCount = (u.commandCounts['tip'] || 0) + (command.name === 'tip' ? 1 : 0);
        const earningsCount = workCount + crimeCount + dailyCount + tipCount;

        if (totalCommands >= 10) {
          const isMostlyEarnings = (earningsCount / totalCommands) >= 0.80;
          if (isMostlyEarnings) {
            u.multiAccountWarnings = (u.multiAccountWarnings || 0) + 1;
            if (u.multiAccountWarnings >= 4 || totalCommands >= 13) {
              u.isMultiAccount = true;
              u.unblockMessageTarget = (u.messageCount || 0) + 100;
              const isRestricted = checkIfRestricted(command.name, args);
              if (isRestricted) {
                isBlocked = true;
              }
            }
          } else {
            u.multiAccountWarnings = 0;
          }
        } else {
          u.multiAccountWarnings = 0;
        }

        if (!isBlocked) {
          u.commandsUsed = totalCommands;
          u.commandCounts[command.name] = (u.commandCounts[command.name] || 0) + 1;
        }
      }
    } else {
      u.isMultiAccount = false;
      u.commandsUsed = (u.commandsUsed || 0) + 1;
      u.commandCounts[command.name] = (u.commandCounts[command.name] || 0) + 1;
    }
  });

  return { isBlocked, reply: message.getReply() };
}

async function runTests() {
  console.log('\n=== RUNNING REFINED MULTI-ACCOUNT AND LOCK TESTS ===\n');

  // Clean up database
  await withData(store => {
    delete store.users[TEST_USER];
    delete store.users[BYPASS_TEST_USER];
    delete store.users['attacker_boss'];
    delete store.users['defender_boss'];
    delete store.inventory[TEST_USER];
    delete store.inventory[BYPASS_TEST_USER];
    delete store.inventory['attacker_boss'];
    delete store.inventory['defender_boss'];
    store.profiles.gangs = store.profiles.gangs || {};
    delete store.profiles.gangs[TEST_GANG_1];
    delete store.profiles.gangs[TEST_GANG_2];
  });

  // TEST 1: Bypass IDs do not trigger warnings/ban
  console.log('--- 1. Bypass IDs Check ---');
  for (let i = 1; i <= 15; i++) {
    const res = await simulateCommand({}, BYPASS_TEST_USER, 'work');
    assert(!res.isBlocked, `Bypassed user ${BYPASS_TEST_USER} command ${i} executed without block`);
  }
  await withData(store => {
    const u = store.users[BYPASS_TEST_USER];
    assert(!u.isMultiAccount, 'Bypassed user is NOT marked as multi-account');
  });

  const NEW_BYPASS_ID = '61571684725864';
  for (let i = 1; i <= 15; i++) {
    const res = await simulateCommand({}, NEW_BYPASS_ID, 'work');
    assert(!res.isBlocked, `Bypassed user ${NEW_BYPASS_ID} command ${i} executed without block`);
  }
  await withData(store => {
    const u = store.users[NEW_BYPASS_ID];
    assert(!u.isMultiAccount, 'New bypassed user is NOT marked as multi-account');
  });

  // TEST 2: Multi-Account Ban trigger at command 13 with 80% earnings ratio
  console.log('\n--- 2. Multi-Account Ban trigger ---');
  for (let i = 1; i <= 9; i++) {
    const res = await simulateCommand({}, TEST_USER, 'work');
    assert(!res.isBlocked, `Command ${i} (work) executed successfully`);
  }

  // Command 10: earnings (warning starts)
  const res10 = await simulateCommand({}, TEST_USER, 'work');
  assert(!res10.isBlocked, `Command 10 (work) executed (warnings count starts, warning = 1)`);

  // Command 11: earnings
  const res11 = await simulateCommand({}, TEST_USER, 'work');
  assert(!res11.isBlocked, `Command 11 (work) executed (warning = 2)`);

  // Command 12: earnings
  const res12 = await simulateCommand({}, TEST_USER, 'work');
  assert(!res12.isBlocked, `Command 12 (work) executed (warning = 3)`);

  // Command 13: earnings (warning = 4, totalCommands = 13, triggers block)
  const res13 = await simulateCommand({}, TEST_USER, 'work');
  assert(res13.isBlocked, `Command 13 (work) is blocked due to multi-account warning limit reached.`);

  // Verify DB state for TEST_USER
  await withData(store => {
    const u = store.users[TEST_USER];
    assert(u.isMultiAccount === true, 'User is marked as isMultiAccount = true in database');
    assert(u.unblockMessageTarget === 100, `unblockMessageTarget is set to 100`);
  });

  // TEST 3: Selective Command Blocking
  console.log('\n--- 3. Selective Command Blocking ---');
  
  // Unrestricted commands should work even while banned
  const resHelp = await simulateCommand({}, TEST_USER, 'help');
  assert(!resHelp.isBlocked, 'Help command is NOT blocked for banned user');

  const resSlots = await simulateCommand({}, TEST_USER, 'slots');
  assert(!resSlots.isBlocked, 'Slots command is NOT blocked for banned user');

  // Restricted commands must be blocked
  const resWork = await simulateCommand({}, TEST_USER, 'work');
  assert(resWork.isBlocked, 'Work command IS blocked for banned user');

  const resTip = await simulateCommand({}, TEST_USER, 'tip');
  assert(resTip.isBlocked, 'Tip command IS blocked for banned user');

  const resGangSkok = await simulateCommand({}, TEST_USER, 'gang', ['skok']);
  assert(resGangSkok.isBlocked, 'Gang skok command IS blocked for banned user');

  const resGangDolacz = await simulateCommand({}, TEST_USER, 'gang', ['dolacz']);
  assert(resGangDolacz.isBlocked, 'Gang dolacz command IS blocked for banned user');

  const resGangInfo = await simulateCommand({}, TEST_USER, 'gang', ['info']);
  assert(!resGangInfo.isBlocked, 'Gang info command is NOT blocked for banned user');

  // TEST 4: Money Transfer Block to banned user
  console.log('\n--- 4. Money Transfer block to banned account ---');
  
  // Set up sender with cash
  await withData(store => {
    const sender = createUser('sender_user_id', store.users);
    sender.balance = 50000;
  });

  const msgTip = {
    author: { id: 'sender_user_id', username: 'Sender' },
    guild: { id: 'test_thread' },
    rawEvent: { threadID: 'test_thread', messageID: 'msg_tip_1' },
    mentions: { users: { first: () => ({ id: TEST_USER, username: 'BannedUser' }) } },
    reply: async (text) => {
      msgTip.lastReply = text;
    }
  };

  const mockClient = {
    userNames: new Map([[TEST_USER, 'BannedUser']])
  };

  await tipCmd.execute(mockClient, msgTip, ['1000', TEST_USER]);
  assert(msgTip.lastReply.includes('zablokowane'), `Tip transfer to banned user failed with message: "${msgTip.lastReply}"`);

  // TEST 5: Unblocking with 100 normal messages
  console.log('\n--- 5. Unblocking with 100 normal messages ---');
  
  // Set messages to 99 -> still blocked
  await withData(store => {
    const u = store.users[TEST_USER];
    u.messageCount = 99;
  });
  const resBlocked99 = await simulateCommand({}, TEST_USER, 'work');
  assert(resBlocked99.isBlocked, 'Work command is still blocked at 99 messages');

  // Set messages to 100 -> unblocked
  await withData(store => {
    const u = store.users[TEST_USER];
    u.messageCount = 100;
  });
  const resUnblocked = await simulateCommand({}, TEST_USER, 'work');
  assert(!resUnblocked.isBlocked, 'Work command is successfully unblocked at 100 messages');

  // Cleanup database
  await withData(store => {
    delete store.users[TEST_USER];
    delete store.users[BYPASS_TEST_USER];
    delete store.users['61571684725864'];
    delete store.users['sender_user_id'];
    delete store.users['attacker_boss'];
    delete store.users['defender_boss'];
    delete store.inventory[TEST_USER];
    delete store.inventory[BYPASS_TEST_USER];
    delete store.inventory['61571684725864'];
    delete store.inventory['sender_user_id'];
    delete store.inventory['attacker_boss'];
    delete store.inventory['defender_boss'];
  });

  console.log(`\n=== TESTS FINISHED: Passed ${passed}, Failed ${failed} ===\n`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
