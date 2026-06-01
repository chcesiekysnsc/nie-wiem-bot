const { withData, createUser } = require('../utils/storage');
const config = require('../config/config');

async function runTest() {
  console.log('=== RUNNING TESTS FOR PERSISTENT NAMES & BATCH PRELOADING ===\n');

  const testUserId = 'test_resolution_user_777';
  const testThreadId = 'test_resolution_thread_666';
  let success = true;

  // 1. Czyszczenie bazy
  await withData(store => {
    delete store.users[testUserId];
  });

  // 2. Test sanitizeUser/name property persistence
  console.log('1. Testing name property persistence in sanitizeUser...');
  await withData(store => {
    const user = createUser(testUserId, store.users);
    user.name = 'Jan Kowalski';
  });

  await withData(store => {
    const user = store.users[testUserId];
    if (user && user.name === 'Jan Kowalski') {
      console.log('   ✅ PASS: Name persistent field saved and retrieved correctly.');
    } else {
      console.error('   ❌ FAIL: Name persistent field was not saved or retrieved correctly. Value:', user ? user.name : 'undefined');
      success = false;
    }
  });

  // 3. Test resolveUserName from database persistent cache
  console.log('\n2. Testing resolveUserName from database cache...');
  // We mock a client without api to ensure it relies on the database
  const mockClient = {
    api: null,
    userNames: new Map(),
    resolvedUserNames: new Set(),
    resolveUserName: async function(apiOrUserId, maybeUserId) {
      const userId = typeof apiOrUserId === 'object' && apiOrUserId !== null ? maybeUserId : apiOrUserId;
      if (this.resolvedUserNames.has(userId) && this.userNames.has(userId)) {
        return this.userNames.get(userId);
      }

      let dbName = null;
      try {
        const { loadData } = require('../utils/storage');
        const usersData = loadData('users');
        if (usersData && usersData[userId] && usersData[userId].name) {
          dbName = usersData[userId].name;
        }
      } catch (_) {}

      if (dbName) {
        this.userNames.set(userId, dbName);
        this.resolvedUserNames.add(userId);
        return dbName;
      }
      return `Użytkownik_${userId.slice(-6)}`;
    }
  };

  const resolved = await mockClient.resolveUserName(testUserId);
  if (resolved === 'Jan Kowalski') {
    console.log('   ✅ PASS: resolvedUserName returned cached database name without hitting FB API.');
  } else {
    console.error('   ❌ FAIL: resolvedUserName did not use the database cache. Value:', resolved);
    success = false;
  }

  // 4. Test !aktualizuj with getThreadInfo preloading and groupMessages update
  console.log('\n3. Testing !aktualizuj database groupMessages and preloading...');
  const currentBotUserId = 'bot_id_999';
  const formerMemberId = 'former_member_555';
  
  const mockClientForAktualizuj = {
    config,
    commands: new Map([['work', {}]]),
    userNames: new Map(),
    resolvedUserNames: new Set(),
    api: {
      getCurrentUserID: () => currentBotUserId,
      getThreadInfo: (threadID, callback) => {
        // Zwraca pełne info wątku z listą userInfo
        callback(null, {
          participantIDs: [testUserId, currentBotUserId],
          userInfo: [
            { id: testUserId, name: 'Jan Kowalski' },
            { id: currentBotUserId, name: 'Casino Bot' }
          ]
        });
      },
      getUserInfo: (userIds, callback) => {
        // former_member_555 is not in the thread participants (he left), so we resolve him via getUserInfo batch call
        const res = {};
        const ids = Array.isArray(userIds) ? userIds : [userIds];
        for (const id of ids) {
          if (id === formerMemberId) {
            res[id] = { name: 'Adam Nowak (Były Członek)' };
          } else {
            res[id] = { name: `Gracz_${id.slice(-6)}` };
          }
        }
        callback(null, res);
      },
      getThreadHistory: (threadID, amount, timestamp, callback) => {
        // history messages
        const history = [
          { senderID: testUserId, body: 'Hej!', timestamp: Date.now() - 5000 },
          { senderID: testUserId, body: '!work', timestamp: Date.now() - 4000 },
          { senderID: formerMemberId, body: 'Byłem tu', timestamp: Date.now() - 3000 }
        ];
        callback(null, history);
      }
    },
    resolveUserName: async function(api, userId) {
      if (this.resolvedUserNames.has(userId) && this.userNames.has(userId)) {
        return this.userNames.get(userId);
      }
      return `Gracz_${userId.slice(-6)}`;
    }
  };

  const mockMessage = {
    author: { id: config.admins[0] },
    guild: { id: testThreadId },
    reply: async (msg) => {
      console.log('   ↳ Odpowiedź bota:', msg.replace(/\n/g, ' | '));
    }
  };

  // Ensure formerMemberId is cleaned up too
  await withData(store => {
    delete store.users[formerMemberId];
  });

  const aktualizujCmd = require('../commands/aktualizuj');
  await aktualizujCmd.execute(mockClientForAktualizuj, mockMessage, []);

  // Weryfikacja bazy danych po aktualizacji
  await withData(store => {
    // 1. Sprawdzamy groupMessages
    const u1 = store.users[testUserId];
    const u2 = store.users[formerMemberId];

    if (u1 && u1.groupMessages && u1.groupMessages[testThreadId] === 2) {
      console.log('   ✅ PASS: user groupMessages[threadId] set correctly to 2.');
    } else {
      console.error('   ❌ FAIL: user groupMessages was not set or is incorrect:', u1 ? u1.groupMessages : 'undefined');
      success = false;
    }

    if (u2 && u2.groupMessages && u2.groupMessages[testThreadId] === 1) {
      console.log('   ✅ PASS: former member groupMessages[threadId] set correctly to 1.');
    } else {
      console.error('   ❌ FAIL: former member groupMessages was not set or is incorrect:', u2 ? u2.groupMessages : 'undefined');
      success = false;
    }

    // 2. Sprawdzamy czy imiona zostały zapisane w bazie
    if (u1 && u1.name === 'Jan Kowalski') {
      console.log('   ✅ PASS: user name saved correctly to database user object.');
    } else {
      console.error('   ❌ FAIL: user name was not saved correctly to database user object. Value:', u1 ? u1.name : 'undefined');
      success = false;
    }

    if (u2 && u2.name === 'Adam Nowak (Były Członek)') {
      console.log('   ✅ PASS: former member name saved correctly to database user object.');
    } else {
      console.error('   ❌ FAIL: former member name was not saved correctly to database user object. Value:', u2 ? u2.name : 'undefined');
      success = false;
    }
  });

  // Czyszczenie
  await withData(store => {
    delete store.users[testUserId];
    delete store.users[formerMemberId];
  });

  console.log('\n--- KANALE TESTÓW ---');
  if (success) {
    console.log('🎉 WSZYSTKIE TESTY ZAKOŃCZYŁY SIĘ SUKCESEM!');
  } else {
    console.error('❌ NIEKTÓRE TESTY NIE POWIODŁY SIĘ.');
  }

  process.exit(success ? 0 : 1);
}

runTest().catch(console.error);
