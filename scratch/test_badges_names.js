const economy = require('../utils/economy');
const pfpCmd = require('../commands/pfp');
const marryCmd = require('../commands/marry');
const rozwodCmd = require('../commands/rozwod');
const { createMessengerClient } = require('../utils/messenger');
const { withData, createUser } = require('../utils/storage');
const config = require('../config/config');

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

async function runTests() {
  console.log('\n=== RUNNING USERNAME FALLBACK & CUSTOM BADGES TESTS ===\n');

  // Clear databases/cleanup
  const targetIds = [
    '100012709246650',
    '100088863765243',
    '100014929176652',
    '100089655356822',
    '61554894353095',
    '100053875564339',
    '777777777777777',
    '888888888888888'
  ];

  await withData(store => {
    for (const id of targetIds) {
      delete store.users[id];
      delete store.inventory[id];
    }
  });

  // 1. Test client.resolveUserName in webhook client mode
  console.log('1. Testing Webhook Client name resolution...');
  const webhookClient = createMessengerClient(config);

  // Mock cacheUser to simulate profile loading
  webhookClient.cacheUser = async (userId) => {
    return {
      id: userId,
      profile: {
        name: `RealName_${userId}`,
        shortName: `ShortName_${userId}`
      }
    };
  };

  const resName1 = await webhookClient.resolveUserName('100012709246650');
  assert(resName1 === 'RealName_100012709246650', `Webhook client resolved name: ${resName1}`);
  assert(webhookClient.userNames.get('100012709246650') === 'RealName_100012709246650', 'Name cached in userNames Map');

  // Test fallback if profile loading fails
  webhookClient.cacheUser = async (userId) => {
    throw new Error('Network error');
  };
  const resFallback = await webhookClient.resolveUserName('non_existent_id');
  assert(resFallback === 'Użytkownik_ent_id', `Fallback resolved name: ${resFallback}`);

  // 2. Test client.resolveUserName in self-bot client mode
  console.log('\n2. Testing Self-Bot Client name resolution...');
  const selfBotClient = {
    api: {
      getUserInfo(userId, cb) {
        cb(null, {
          [userId]: { name: `SelfBotRealName_${userId}` }
        });
      }
    },
    userNames: new Map(),
    resolvedUserNames: new Set(),
    async resolveUserName(apiOrUserId, maybeUserId) {
      let api = null;
      let userId = null;
      if (typeof apiOrUserId === 'object' && apiOrUserId !== null) {
        api = apiOrUserId;
        userId = maybeUserId;
      } else {
        userId = apiOrUserId;
        api = this.api;
      }
      if (this.resolvedUserNames.has(userId) && this.userNames.has(userId)) {
        return this.userNames.get(userId);
      }
      return new Promise((resolve) => {
        if (!api) {
          return resolve(this.userNames.get(userId) || `Użytkownik_${userId.slice(-6)}`);
        }
        api.getUserInfo(userId, (err, ret) => {
          if (!err && ret && ret[userId]) {
            const name = ret[userId].name;
            this.userNames.set(userId, name);
            this.resolvedUserNames.add(userId);
            resolve(name);
          } else {
            const fallback = this.userNames.get(userId) || `Użytkownik_${userId.slice(-6)}`;
            resolve(fallback);
          }
        });
      });
    }
  };

  // Test with two-parameter signature
  const resSelfBotTwo = await selfBotClient.resolveUserName(selfBotClient.api, '100012709246650');
  assert(resSelfBotTwo === 'SelfBotRealName_100012709246650', `Self-Bot resolved name (2 params): ${resSelfBotTwo}`);

  // Test with single-parameter signature
  const resSelfBotOne = await selfBotClient.resolveUserName('100088863765243');
  assert(resSelfBotOne === 'SelfBotRealName_100088863765243', `Self-Bot resolved name (1 param): ${resSelfBotOne}`);

  // 3. Test refreshBadges database updates
  console.log('\n3. Testing refreshBadges database updates...');
  await withData(store => {
    // ID 100012709246650
    const u1 = createUser('100012709246650', store.users);
    u1.badges = ['SomeOtherBadge'];
    economy.refreshBadges(u1, {});
    assert(u1.badges[0] === '🍌 Minionek' && u1.badges[1] === '🏛️ Radny', `u1 badges after refresh: ${JSON.stringify(u1.badges)}`);

    // ID 100088863765243
    const u2 = createUser('100088863765243', store.users);
    economy.refreshBadges(u2, {});
    assert(u2.badges[0] === '🏛️ Radny', `u2 badges after refresh: ${JSON.stringify(u2.badges)}`);

    // GOAT ID 100014929176652
    const u3 = createUser('100014929176652', store.users);
    economy.refreshBadges(u3, {});
    assert(u3.badges[0] === '🐐 GOAT' && u3.badges[1] === '🏛️ Radny', `GOAT badges after refresh: ${JSON.stringify(u3.badges)}`);

    // Sub-admin ID 100089655356822
    const u4 = createUser('100089655356822', store.users);
    economy.refreshBadges(u4, {});
    assert(u4.badges.includes('🏛️ Radny'), `Sub-admin badges contains Radny: ${u4.badges.includes('🏛️ Radny')}`);
  });

  // 4. Test !pfp command rendering & exact badge order
  console.log('\n4. Testing !pfp command rendering & exact badge order...');
  const mockPfpClient = createMessengerClient(config);
  mockPfpClient.cacheUser = async (userId) => {
    return {
      id: userId,
      profile: {
        name: `RealName_${userId}`,
        shortName: `ShortName_${userId}`
      }
    };
  };

  const getPfpBadges = async (userId) => {
    let outputBadges = [];
    const message = {
      author: { id: userId, username: 'Test' },
      guild: { id: 'test_thread' },
      rawEvent: { threadID: 'test_thread' },
      content: '!pfp',
      mentions: { users: { first: () => null } },
      reply: async (payload) => {
        const body = typeof payload === 'string' ? payload : payload.body || '';
        // Extract badges from the formatted reply
        // "🎖️ Odznaki: 🍌 Minionek, 🏛️ Radny, ..."
        const match = body.match(/🎖️ Odznaki:\s*(.*)/);
        if (match) {
          outputBadges = match[1].split(',').map(s => s.trim()).filter(Boolean);
        }
      }
    };

    // Ensure user exists in storage
    await withData(store => {
      const u = createUser(userId, store.users);
      economy.refreshBadges(u, {});
    });

    await pfpCmd.execute(mockPfpClient, message, []);
    return outputBadges;
  };

  // Test u1 ordering: Minionek, Radny first
  const b1 = await getPfpBadges('100012709246650');
  assert(b1[0] === '🍌 Minionek' && b1[1] === '🏛️ Radny', `User 100012709246650 rendered badges: ${JSON.stringify(b1)}`);

  // Test u2 ordering: Radny first
  const b2 = await getPfpBadges('100088863765243');
  assert(b2[0] === '🏛️ Radny', `User 100088863765243 rendered badges: ${JSON.stringify(b2)}`);

  // Test GOAT ordering: GOAT first, Radny second
  const b3 = await getPfpBadges('100014929176652');
  assert(b3[0] === '🐐 GOAT' && b3[1] === '🏛️ Radny', `GOAT rendered badges: ${JSON.stringify(b3)}`);

  // Test Sub-admin ordering: CZADOWY, Radny, MENDA
  const b4 = await getPfpBadges('100089655356822');
  // CZADOWY is 4th, Radny 5th, MENDA 6th (Admin, OG, Beta Tester are first three)
  assert(b4[3] === '🔥 CZADOWY' && b4[4] === '🏛️ Radny' && b4[5] === '🐛 MENDA', `Sub-admin rendered badges: ${JSON.stringify(b4)}`);

  // 5. Test marry command partner async name resolution
  console.log('\n5. Testing marry/rozwod commands async name resolution...');
  const proposerId = '777777777777777';
  const targetId = '888888888888888';

  // Setup initial marriage request
  mockPfpClient.marriageRequests.set(`${proposerId}-${targetId}`, {
    proposerId,
    targetId
  });

  let replyText = '';
  const marryAcceptMsg = {
    author: { id: targetId },
    guild: { id: 'test_thread' },
    rawEvent: { threadID: 'test_thread' },
    content: `!marry accept ${proposerId}`,
    mentions: { users: { first: () => null } },
    reply: async (text) => { replyText = text; }
  };

  await marryCmd.execute(mockPfpClient, marryAcceptMsg, ['accept', proposerId]);
  assert(replyText.includes(`małżeństwem z **RealName_${proposerId}**`), `Marriage accept response: ${replyText}`);

  // Test rozwod
  const divorceMsg = {
    author: { id: targetId },
    guild: { id: 'test_thread' },
    rawEvent: { threadID: 'test_thread' },
    content: '!rozwod',
    mentions: { users: { first: () => null } },
    reply: async (text) => { replyText = text; }
  };

  await rozwodCmd.execute(mockPfpClient, divorceMsg, []);
  assert(replyText.includes(`Rozwiodłeś się z **RealName_${proposerId}**`), `Divorce response: ${replyText}`);

  console.log(`\n=== TEST RUN FINISHED: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test run failed with error:', err);
  process.exit(1);
});
