const { withData } = require('../utils/storage');
const nickCmd = require('../commands/nick');

async function runTests() {
  console.log('=== TEST ODRZUCENIA !NICK PRZEZ STRAŻNIKA ===\n');

  const targetId = 'target_user_888';
  const threadId = 'test_thread_999';
  const guardNick = 'ZablokowanyNick';

  // 1. Ustawienie strażnika w bazie danych
  await withData(store => {
    store.profiles.threadSettings = store.profiles.threadSettings || {};
    store.profiles.threadSettings[threadId] = {
      nicknameGuard: {
        userId: targetId,
        nickname: guardNick
      }
    };
  });

  // Mock API
  let changeNicknameCalled = false;
  let replyText = '';
  const mockClient = {
    api: {
      changeNickname: (nick, tId, tgId, cb) => {
        changeNicknameCalled = true;
        cb(null);
      }
    }
  };

  // TEST A: Próba zmiany na inny nick przez komendę !nick
  console.log('--- TEST A: Próba zmiany na inny nick (powinno być odrzucone) ---');
  const messageA = {
    author: { id: 'some_user', username: 'User' },
    mentions: { users: { first: () => ({ id: targetId, username: 'Target' }) } },
    reply: async (text) => {
      replyText = text;
      console.log('Odpowiedź bota:', text);
    },
    rawEvent: {
      threadID: threadId,
      mentions: {
        [targetId]: 'Target'
      }
    }
  };

  await nickCmd.execute(mockClient, messageA, ['@Target', 'FajnyNick']);

  if (!changeNicknameCalled && replyText.includes('Użytkownik ma zablokowany pseudonim przez strażnika')) {
    console.log('✅ TEST A PASSED!');
  } else {
    console.error('❌ TEST A FAILED!', { changeNicknameCalled, replyText });
  }

  // TEST B: Próba zmiany na ten sam nick przez komendę !nick (powinno być dozwolone)
  console.log('\n--- TEST B: Próba zmiany na zablokowany nick (powinno być dozwolone) ---');
  changeNicknameCalled = false;
  replyText = '';
  const messageB = {
    author: { id: 'some_user', username: 'User' },
    mentions: { users: { first: () => ({ id: targetId, username: 'Target' }) } },
    reply: async (text) => {
      replyText = text;
      console.log('Odpowiedź bota:', text);
    },
    rawEvent: {
      threadID: threadId,
      mentions: {
        [targetId]: 'Target'
      }
    }
  };

  await nickCmd.execute(mockClient, messageB, ['@Target', guardNick]);

  if (changeNicknameCalled && replyText.includes('Zmieniono pseudonim')) {
    console.log('✅ TEST B PASSED!');
  } else {
    console.error('❌ TEST B FAILED!', { changeNicknameCalled, replyText });
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
