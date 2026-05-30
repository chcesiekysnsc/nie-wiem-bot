const { withData } = require('../utils/storage');
const nickCmd = require('../commands/nick');
const guardnickCmd = require('../commands/guardnick');

async function runTests() {
  console.log('=== TESTY SPRAWDZANIA AUTORA JAKO CELU KOMEND ===\n');

  const authorId = '100060812419294'; // twórca bota
  const threadId = 'test_thread_777';

  // Mock bazy danych
  await withData(store => {
    store.profiles.threadSettings = store.profiles.threadSettings || {};
    store.profiles.threadSettings[threadId] = {};
  });

  // Mock API
  let changeNicknameCalls = [];
  const mockClient = {
    api: {
      changeNickname: (nick, tId, tgId, cb) => {
        changeNicknameCalls.push({ nick, tId, tgId });
        cb(null);
      }
    },
    config: {
      admins: []
    }
  };

  // TEST 1: !nick MojeNowePrzezwisko (bez oznaczenia)
  console.log('--- TEST 1: Zmiana własnego nicku (!nick MojePrzezwisko) ---');
  changeNicknameCalls = [];
  const message1 = {
    author: { id: authorId, username: 'Tworca' },
    mentions: { users: { first: () => null } },
    reply: async (text) => console.log('Odpowiedź bota:', text),
    rawEvent: { threadID: threadId }
  };

  await nickCmd.execute(mockClient, message1, ['MojePrzezwisko']);

  console.log('Wywołania changeNickname:', changeNicknameCalls);
  if (changeNicknameCalls.length === 1 && changeNicknameCalls[0].tgId === authorId && changeNicknameCalls[0].nick === 'MojePrzezwisko') {
    console.log('✅ TEST 1 PASSED!');
  } else {
    console.error('❌ TEST 1 FAILED!');
  }

  // TEST 2: !guardnick WymuszonyNickDlaSiebie (bez oznaczenia)
  console.log('\n--- TEST 2: Blokada własnego nicku (!guardnick ZablokowanyNick) ---');
  changeNicknameCalls = [];
  const message2 = {
    author: { id: authorId, username: 'Tworca' },
    mentions: { users: { first: () => null } },
    reply: async (text) => console.log('Odpowiedź bota:', text),
    rawEvent: { threadID: threadId }
  };

  await guardnickCmd.execute(mockClient, message2, ['ZablokowanyNick']);

  console.log('Wywołania changeNickname:', changeNicknameCalls);
  
  let savedGuard = null;
  await withData(store => {
    if (store.profiles.threadSettings && store.profiles.threadSettings[threadId] && store.profiles.threadSettings[threadId].nicknameGuard) {
      savedGuard = store.profiles.threadSettings[threadId].nicknameGuard;
    }
  });
  console.log('Zapisany guard w db:', savedGuard);

  if (changeNicknameCalls.length === 1 && changeNicknameCalls[0].tgId === authorId && changeNicknameCalls[0].nick === 'ZablokowanyNick' &&
      savedGuard && savedGuard.userId === authorId && savedGuard.nickname === 'ZablokowanyNick') {
    console.log('✅ TEST 2 PASSED!');
  } else {
    console.error('❌ TEST 2 FAILED!');
  }

  // Czyszczenie bazy
  await withData(store => {
    if (store.profiles.threadSettings && store.profiles.threadSettings[threadId]) {
      delete store.profiles.threadSettings[threadId];
    }
  });

  console.log('\n=== TESTY UKOŃCZONE ===');
}

runTests().catch(console.error);
