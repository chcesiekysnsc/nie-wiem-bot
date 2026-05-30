const { withData } = require('../utils/storage');
const guardnickCmd = require('../commands/guardnick');
const nickCmd = require('../commands/nick');

async function runTests() {
  console.log('=== TESTY DLA MULTI-STRAŻNIKA PSEUDONIMÓW ===\n');

  const threadId = 'test_thread_multi_123';
  const userA = 'user_abc_111';
  const nickA = 'ZablokowanyA';
  const userB = 'user_xyz_222';
  const nickB = 'ZablokowanyB';

  const mockApi = {
    changeNicknameCalls: [],
    getCurrentUserID: () => 'bot_user_id',
    changeNickname: function(nick, tId, uId, cb) {
      this.changeNicknameCalls.push({ nick, tId, uId });
      cb(null);
    }
  };

  const mockClient = {
    api: mockApi
  };

  // Funkcja symulująca logikę interceptora zmiany pseudonimu z self_bot.js
  async function simulateEvent(event) {
    const isNicknameEvent = (event.type === 'event' && (event.logMessageType === 'log:thread-nickname' || event.logMessageType === 'log:user-nickname')) 
                         || (event.type === 'log:thread-nickname' || event.type === 'log:user-nickname');
    if (isNicknameEvent) {
      const botId = mockApi.getCurrentUserID();
      const authorId = event.author;
      if (botId && authorId && String(authorId) === String(botId)) {
        return 'IGNORED_SELF';
      }

      const tId = event.threadID;
      const tgId = event.logMessageData?.participant_id || event.logMessageData?.participantID;
      const newNickname = event.logMessageData?.nickname;

      if (tId && tgId) {
        let guardNickname = null;
        await withData(store => {
          if (store.profiles.threadSettings && store.profiles.threadSettings[tId]) {
            const settings = store.profiles.threadSettings[tId];
            if (settings.nicknameGuards && settings.nicknameGuards[tgId]) {
              guardNickname = settings.nicknameGuards[tgId];
            }
          }
        });

        if (guardNickname && newNickname !== guardNickname) {
          console.log(`[SIMULATOR] Przywracam pseudonim dla ${tgId} -> ${guardNickname}`);
          await new Promise(r => mockApi.changeNickname(guardNickname, tId, tgId, () => r()));
          return 'REVERTED';
        }
      }
    }
    return 'NO_ACTION';
  }

  // 1. Dodawanie pierwszego strażnika (User A)
  console.log('--- TEST 1: Włączenie strażnika dla Użytkownika A ---');
  let message = {
    author: { id: '100060812419294', username: 'Owner' }, // Creator
    mentions: { users: { first: () => ({ id: userA, username: 'UserA' }) } },
    reply: async (txt) => console.log('Bot:', txt),
    rawEvent: { threadID: threadId, mentions: { [userA]: 'UserA' } }
  };

  mockApi.changeNicknameCalls = [];
  await guardnickCmd.execute(mockClient, message, ['@UserA', nickA]);

  let data = null;
  await withData(store => {
    data = store.profiles.threadSettings[threadId];
  });
  console.log('Stan bazy:', JSON.stringify(data));

  if (data?.nicknameGuards?.[userA] === nickA && mockApi.changeNicknameCalls.length === 1) {
    console.log('✅ TEST 1 PASSED!');
  } else {
    console.error('❌ TEST 1 FAILED!');
  }

  // 2. Dodawanie drugiego strażnika (User B)
  console.log('\n--- TEST 2: Włączenie strażnika dla Użytkownika B ---');
  let message2 = {
    author: { id: '100060812419294', username: 'Owner' },
    mentions: { users: { first: () => ({ id: userB, username: 'UserB' }) } },
    reply: async (txt) => console.log('Bot:', txt),
    rawEvent: { threadID: threadId, mentions: { [userB]: 'UserB' } }
  };

  await guardnickCmd.execute(mockClient, message2, ['@UserB', nickB]);

  await withData(store => {
    data = store.profiles.threadSettings[threadId];
  });
  console.log('Stan bazy:', JSON.stringify(data));

  if (data?.nicknameGuards?.[userA] === nickA && data?.nicknameGuards?.[userB] === nickB) {
    console.log('✅ TEST 2 PASSED!');
  } else {
    console.error('❌ TEST 2 FAILED!');
  }

  // 3. Test blokady komendy !nick dla User A i User B
  console.log('\n--- TEST 3: Blokowanie komendy !nick dla chronionych użytkowników ---');
  let message3 = {
    author: { id: 'random_user', username: 'Random' },
    mentions: { users: { first: () => ({ id: userA, username: 'UserA' }) } },
    reply: async (txt) => console.log('Bot reply:', txt),
    rawEvent: { threadID: threadId, mentions: { [userA]: 'UserA' } }
  };

  mockApi.changeNicknameCalls = [];
  await nickCmd.execute(mockClient, message3, ['@UserA', 'ZlyNick']);
  if (mockApi.changeNicknameCalls.length === 0) {
    console.log('✅ TEST 3 PASSED!');
  } else {
    console.error('❌ TEST 3 FAILED!');
  }

  // 4. Test symulacji manualnej zmiany
  console.log('\n--- TEST 4: Symulacja manualnej zmiany pseudonimu dla User B ---');
  mockApi.changeNicknameCalls = [];
  const event = {
    type: 'event',
    logMessageType: 'log:thread-nickname',
    threadID: threadId,
    author: 'user_changing',
    logMessageData: {
      participantID: userB,
      nickname: 'NowyZlyNick'
    }
  };

  const res = await simulateEvent(event);
  console.log('Wynik symulacji:', res);
  if (res === 'REVERTED' && mockApi.changeNicknameCalls.length === 1 && mockApi.changeNicknameCalls[0].nick === nickB) {
    console.log('✅ TEST 4 PASSED!');
  } else {
    console.error('❌ TEST 4 FAILED!');
  }

  // 5. Wyłączenie dla jednego użytkownika (User A)
  console.log('\n--- TEST 5: Wyłączenie strażnika dla Użytkownika A ---');
  let message5 = {
    author: { id: '100060812419294', username: 'Owner' },
    mentions: { users: { first: () => ({ id: userA, username: 'UserA' }) } },
    reply: async (txt) => console.log('Bot:', txt),
    rawEvent: { threadID: threadId, mentions: { [userA]: 'UserA' } }
  };

  await guardnickCmd.execute(mockClient, message5, ['off', '@UserA']);
  await withData(store => {
    data = store.profiles.threadSettings[threadId];
  });
  console.log('Stan bazy:', JSON.stringify(data));
  if (data?.nicknameGuards?.[userA] === undefined && data?.nicknameGuards?.[userB] === nickB) {
    console.log('✅ TEST 5 PASSED!');
  } else {
    console.error('❌ TEST 5 FAILED!');
  }

  // 6. Wyłączenie dla wszystkich (all)
  console.log('\n--- TEST 6: Wyłączenie strażnika dla wszystkich (off all) ---');
  let message6 = {
    author: { id: '100060812419294', username: 'Owner' },
    mentions: { users: { first: () => null } },
    reply: async (txt) => console.log('Bot:', txt),
    rawEvent: { threadID: threadId }
  };

  await guardnickCmd.execute(mockClient, message6, ['off', 'all']);
  await withData(store => {
    data = store.profiles.threadSettings[threadId];
  });
  console.log('Stan bazy:', JSON.stringify(data));
  if (data?.nicknameGuards === undefined) {
    console.log('✅ TEST 6 PASSED!');
  } else {
    console.error('❌ TEST 6 FAILED!');
  }

  // Czyszczenie bazy testowej
  await withData(store => {
    delete store.profiles.threadSettings[threadId];
  });

  console.log('\n=== TESTY MULTI-STRAŻNIKA UKOŃCZONE ===');
}

runTests().catch(console.error);
