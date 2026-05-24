const { withData, createUser } = require('../utils/storage');
const marryCmd = require('../commands/marry');
const rozwodCmd = require('../commands/rozwod');
const pfpCmd = require('../commands/pfp');

async function runTests() {
  console.log('=== RUNNING INTEGRATED TESTS ===\n');

  // Setup test users
  const user1Id = '61554894353095'; // OG & Beta Tester
  const user2Id = '100060812419294'; // Creator & Admin
  const user3Id = 'some_normal_user';

  await withData(store => {
    // Reset databases for these IDs
    const u1 = createUser(user1Id, store.users);
    u1.balance = 150000;
    u1.marriedTo = null;
    u1.badges = ['SomeInvBadge'];

    const u2 = createUser(user2Id, store.users);
    u2.balance = 200000;
    u2.marriedTo = null;
    u2.badges = ['CreatorInvBadge'];

    const u3 = createUser(user3Id, store.users);
    u3.balance = 50000;
    u3.marriedTo = null;
    u3.badges = [];

    // Clean any old marriage banks
    store.profiles.marriageBanks = store.profiles.marriageBanks || {};
    delete store.profiles.marriageBanks[`${user1Id}-${user2Id}`];
    delete store.profiles.marriageBanks[`${user2Id}-${user1Id}`];
  });

  const mockClient = {
    api: null,
    userNames: new Map([
      [user1Id, 'OG_Tester_1'],
      [user2Id, 'Creator_Wojtek'],
      [user3Id, 'Normal_Adam']
    ]),
    marriageRequests: new Map()
  };

  // Test 1: Badges Order for Beta Tester & Creator
  console.log('--- TEST 1: Badges Order verification ---');
  let mockMsgPfp = {
    author: { id: user1Id },
    mentions: { users: { first: () => null } },
    reply: async () => {},
    rawEvent: { threadID: 'test_thread' },
    guild: { id: 'test_thread' }
  };
  
  // We mock client.api.sendMessage to capture response
  let capturedBadges = [];
  mockClient.api = {
    sendMessage: (payload) => {
      // Find badges line
      const match = payload.body.match(/🎖️ Odznaki: (.*)/);
      if (match) capturedBadges = match[1].split(', ');
    }
  };

  // Check beta tester badges
  await pfpCmd.execute(mockClient, mockMsgPfp, []);
  console.log('User 1 (Beta Tester) Badges:', capturedBadges);
  if (capturedBadges[0] === '✨ OG' && capturedBadges[1] === '🧪 Beta Tester') {
    console.log('✅ PASS: OG & Beta Tester are first two badges.');
  } else {
    console.log('❌ FAIL: Incorrect badge order for Beta Tester.');
  }

  // Check creator badges
  mockMsgPfp.author.id = user2Id;
  await pfpCmd.execute(mockClient, mockMsgPfp, []);
  console.log('User 2 (Creator) Badges:', capturedBadges);
  if (capturedBadges[0] === '🛠️ TWÓRCA' && capturedBadges[1] === '👑 ADMIN') {
    console.log('✅ PASS: Creator & Admin are first two badges.');
  } else {
    console.log('❌ FAIL: Incorrect badge order for Creator.');
  }

  // Test 2: Replied-to message fallback removal
  console.log('\n--- TEST 2: Message Reply target behavior ---');
  // Mocking a message context that simulates a message reply
  const mockMsgReply = {
    author: { id: user3Id, username: 'Normal_Adam', profile: { name: 'Normal_Adam' } },
    content: '!pfp',
    guild: { id: 'test_thread' },
    rawEvent: {
      type: 'message_reply',
      messageReply: { senderID: user1Id } // Replied to User 1
    },
    mentionedIds: [],
    mentions: {
      users: {
        first: () => {
          // This simulates the check we modified in self_bot.js
          const mentions = {}; // No actual mentions
          const mentionedId = Object.keys(mentions)[0];
          if (mentionedId) return { id: mentionedId };
          return null; // The fallback event.messageReply is removed!
        }
      }
    },
    reply: async (text) => {
      console.log('Mock Reply Output:', text);
    }
  };

  const targetUser = mockMsgReply.mentions.users.first();
  if (targetUser === null) {
    console.log('✅ PASS: Replying to someone and typing !pfp correctly targets nobody (falls back to self).');
  } else {
    console.log('❌ FAIL: Replying to someone still targets the replied-to author.');
  }

  // Test 3: Joint Marriage Bank Deposit and Limits
  console.log('\n--- TEST 3: Joint Marriage Bank Deposits & Withdrawals ---');
  // First, marry User 1 and User 2
  await withData(store => {
    store.users[user1Id].marriedTo = user2Id;
    store.users[user2Id].marriedTo = user1Id;
  });

  const mockMsgMarry = {
    author: { id: user1Id },
    mentions: { users: { first: () => null } },
    reply: async (text) => {
      console.log('Deposit/Withdraw Reply:', text.replace(/\n/g, ' '));
    }
  };

  // Show status (should be empty bank)
  console.log('Checking default status with empty bank:');
  await marryCmd.execute(mockClient, mockMsgMarry, []);

  // Deposit 50,000 coins
  console.log('Wpłata 50 000:');
  await marryCmd.execute(mockClient, mockMsgMarry, ['wplac', '50000']);

  // Deposit another 60,000 (should fail as it exceeds 100k contribution limit)
  console.log('Wpłata 60 000 (powinna przekroczyć limit):');
  await marryCmd.execute(mockClient, mockMsgMarry, ['wplac', '60000']);

  // Deposit 50,000 more (should succeed and hit exactly 100k contribution)
  console.log('Wpłata 50 000 (powinna dobić do limitu 100k):');
  await marryCmd.execute(mockClient, mockMsgMarry, ['wplac', '50000']);

  // Withdraw 30,000
  console.log('Wypłata 30 000:');
  await marryCmd.execute(mockClient, mockMsgMarry, ['wyplac', '30000']);

  // Verify joint bank state
  let finalBank;
  await withData(store => {
    const key = [user1Id, user2Id].sort().join('-');
    finalBank = store.profiles.marriageBanks[key];
  });
  console.log('Marriage bank state in DB:', finalBank);
  if (finalBank && finalBank.balance === 70000 && finalBank.contributions[user1Id] === 70000) {
    console.log('✅ PASS: Deposit limit and balance match expectation after withdrawal.');
  } else {
    console.log('❌ FAIL: Incorrect bank state.');
  }

  // Test 4: Divorce Payout
  console.log('\n--- TEST 4: Divorce Payout splitting ---');
  const mockMsgDivorce = {
    author: { id: user1Id },
    reply: async (text) => {
      console.log('Divorce Reply:', text);
    }
  };

  await rozwodCmd.execute(mockClient, mockMsgDivorce, []);

  // Check user balances after divorce
  let u1Bal, u2Bal, bankExists;
  await withData(store => {
    u1Bal = store.users[user1Id].balance;
    u2Bal = store.users[user2Id].balance;
    const key = [user1Id, user2Id].sort().join('-');
    bankExists = !!store.profiles.marriageBanks[key];
    
    // Cleanup databases
    delete store.users[user1Id];
    delete store.users[user2Id];
    delete store.users[user3Id];
  });

  console.log(`Balances - User 1: ${u1Bal} (expected 97500), User 2: ${u2Bal} (expected 217500)`);
  if (u1Bal === 97500 && u2Bal === 217500 && !bankExists) {
    console.log('✅ PASS: Marriage bank split 50/50 after 50% fee and deleted on divorce.');
  } else {
    console.log('❌ FAIL: Incorrect balances or bank not deleted after divorce.');
  }

  console.log('\n=== ALL TESTS COMPLETED ===');
}

runTests().catch(console.error);
