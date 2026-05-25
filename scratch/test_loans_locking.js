const { withData, createUser } = require('../utils/storage');
const economy = require('../utils/economy');
const marryCmd = require('../commands/marry');
const robCmd = require('../commands/rob');
const tipCmd = require('../commands/tip');
const gangCmd = require('../commands/gang');
const config = require('../config/config');

const TEST_USER = 'loan_lock_user';
const TEST_TARGET = 'loan_target_user';
const TEST_GANG = 'loan_test_gang';

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

const messagesMap = new Map();

function mockMessage(userId, content = '', mentionedUser = null) {
  let replyMsg = '';
  const msgId = 'msg_' + Math.random();
  const msgObj = {
    author: { id: userId, username: 'TestUser' },
    guild: { id: 'test_thread' },
    rawEvent: { threadID: 'test_thread', messageID: msgId },
    content,
    mentions: { users: { first: () => mentionedUser } },
    reply: async (text) => {
      replyMsg = typeof text === 'string' ? text : JSON.stringify(text);
    },
    getReply: () => replyMsg
  };
  messagesMap.set(msgId, msgObj);
  return msgObj;
}

async function runTests() {
  console.log('\n=== RUNNING LOAN FUNDS LOCKING TESTS ===\n');

  // Clean up database
  await withData(store => {
    delete store.users[TEST_USER];
    delete store.users[TEST_TARGET];
    delete store.inventory[TEST_USER];
    delete store.inventory[TEST_TARGET];
    store.profiles.gangs = store.profiles.gangs || {};
    delete store.profiles.gangs[TEST_GANG];
  });

  // Setup Attacking gang and users
  await withData(store => {
    store.profiles.gangs[TEST_GANG] = {
      name: 'Test Gang',
      bossId: TEST_USER,
      vault: 100000,
      levelDziupla: 1
    };

    const user = createUser(TEST_USER, store.users);
    user.balance = 300000;
    user.gangId = TEST_GANG;
    user.gangRole = 'boss';
    user.marriedTo = TEST_TARGET; // Set marriage status to pass marriage checks

    // Simulate active loan (taken 1 hour ago so it's not auto-repaid inside withData)
    user.activeLoan = {
      originalAmount: 300000,
      amount: 300000,
      rate: 0.08,
      takenAt: Date.now() - 1 * 60 * 60 * 1000
    };

    const target = createUser(TEST_TARGET, store.users);
    target.balance = 100000;
    target.marriedTo = TEST_USER;

    // Initialize marriage bank
    const marriageKey = [TEST_USER, TEST_TARGET].sort().join('-');
    store.profiles.marriageBanks = store.profiles.marriageBanks || {};
    store.profiles.marriageBanks[marriageKey] = {
      balance: 0,
      contributions: {}
    };
  });

  const mockClient = {
    userNames: new Map([
      [TEST_USER, 'Borrower'],
      [TEST_TARGET, 'Target']
    ]),
    marriageRequests: new Map(),
    api: {
      sendMessage: (payload, threadId, callback, replyToMessageId) => {
        if (replyToMessageId && messagesMap.has(replyToMessageId)) {
          const msgObj = messagesMap.get(replyToMessageId);
          msgObj.reply(payload.body || payload);
        }
      }
    }
  };

  // 1. Tip block test
  console.log('--- 1. Tip Loan Funds Block ---');
  const msgTip = mockMessage(TEST_USER, '', { id: TEST_TARGET, username: 'Target' });
  await tipCmd.execute(mockClient, msgTip, ['10000', TEST_TARGET]);
  assert(msgTip.getReply().includes('zablokowane z tytułu pożyczki'), `Transfer of loan funds is blocked (Reply: "${msgTip.getReply()}")`);

  // 2. Marry block test
  console.log('\n--- 2. Marry Loan Funds Block ---');
  const msgMarry = mockMessage(TEST_USER, '');
  await marryCmd.execute(mockClient, msgMarry, ['wplac', '10000']);
  assert(msgMarry.getReply().includes('zablokowane z tytułu pożyczki'), `Marriage deposit of loan funds is blocked (Reply: "${msgMarry.getReply()}")`);

  // 3. Gang Deposit block test
  console.log('\n--- 3. Gang Deposit Loan Funds Block ---');
  const msgGang = mockMessage(TEST_USER, '');
  await gangCmd.execute(mockClient, msgGang, ['wplac', '10000']);
  assert(msgGang.getReply().includes('zablokowane z tytułu pożyczki'), `Gang deposit of loan funds is blocked (Reply: "${msgGang.getReply()}")`);

  // 4. Rob protection test (balance = 300,000, loan = 300,000, stealable = 0)
  console.log('\n--- 4. Rob Command Protection ---');
  const msgRob = mockMessage(TEST_TARGET, '', { id: TEST_USER, username: 'Borrower' });
  await robCmd.execute(mockClient, msgRob, [TEST_USER]);
  assert(msgRob.getReply().includes('za mało kasy'), `Robbing is blocked because stealable balance is 0 (Reply: "${msgRob.getReply()}")`);

  // Now add 50,000 to borrower's balance (balance = 350,000, loan = 300,000, stealable = 50,000)
  // Borrower should now be rob-able!
  await withData(store => {
    store.users[TEST_USER].balance = 350000;
  });
  
  const msgRobSuccess = mockMessage(TEST_TARGET, '', { id: TEST_USER, username: 'Borrower' });
  await robCmd.execute(mockClient, msgRobSuccess, [TEST_USER]);
  assert(!msgRobSuccess.getReply().includes('za mało kasy'), `Robbing is allowed when user has extra funds above loan (Reply: "${msgRobSuccess.getReply()}")`);

  // 5. Unlocking after repayment
  console.log('\n--- 5. Freeing funds after loan repayment ---');
  await withData(store => {
    const user = store.users[TEST_USER];
    user.activeLoan = null;
    user.balance = 50000;
  });

  const msgTipSuccess = mockMessage(TEST_USER, '', { id: TEST_TARGET, username: 'Target' });
  await tipCmd.execute(mockClient, msgTipSuccess, ['10000', TEST_TARGET]);
  assert(msgTipSuccess.getReply().includes('Przelano'), `Transfer is allowed after loan is repaid (Reply: "${msgTipSuccess.getReply()}")`);

  // Cleanup database
  await withData(store => {
    delete store.users[TEST_USER];
    delete store.users[TEST_TARGET];
    delete store.inventory[TEST_USER];
    delete store.inventory[TEST_TARGET];
    delete store.profiles.gangs[TEST_GANG];
    const marriageKey = [TEST_USER, TEST_TARGET].sort().join('-');
    if (store.profiles.marriageBanks) {
      delete store.profiles.marriageBanks[marriageKey];
    }
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
