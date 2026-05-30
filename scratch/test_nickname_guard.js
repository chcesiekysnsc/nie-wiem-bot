const { withData } = require('../utils/storage');

async function runTests() {
  console.log('=== TESTY DLA STRAŻNIKA PSEUDONIMU (GUARDNICK) ===\n');

  const threadId = 'test_thread_123';
  const targetId = 'target_user_456';
  const botId = 'bot_user_789';
  const guardNick = 'ZablokowanyNick';

  // 1. Konfiguracja bazy danych testowych
  await withData(store => {
    store.profiles.threadSettings = store.profiles.threadSettings || {};
    store.profiles.threadSettings[threadId] = store.profiles.threadSettings[threadId] || {};
    store.profiles.threadSettings[threadId].nicknameGuard = {
      userId: targetId,
      nickname: guardNick
    };
  });

  console.log('Baza danych przygotowana z guardnick dla użytkownika:', targetId, '->', guardNick);

  // Funkcja symulująca logikę interceptora z self_bot.js
  async function simulateEvent(event, mockApi) {
    const isNicknameEvent = (event.type === 'event' && (event.logMessageType === 'log:thread-nickname' || event.logMessageType === 'log:user-nickname')) 
                         || (event.type === 'log:thread-nickname' || event.type === 'log:user-nickname');
    if (isNicknameEvent) {
      // Ignoruj zmiany wykonane przez samego bota, aby zapobiec pętlom i rate-limitom
      const currentBotId = typeof mockApi.getCurrentUserID === 'function' ? mockApi.getCurrentUserID() : '';
      if (currentBotId && event.author && String(event.author) === String(currentBotId)) {
        console.log(`[SIMULATOR] Ignoruję własną zmianę pseudonimu bota (author: ${event.author})`);
        return 'IGNORED_SELF';
      }

      const tId = event.threadID;
      const tgId = event.logMessageData?.participant_id 
                || event.logMessageData?.participantId 
                || event.logMessageData?.target_id 
                || event.logMessageData?.targetId
                || event.participantID
                || event.targetID;
      
      const newNickname = event.logMessageData?.nickname 
                       || event.logMessageData?.newNickname
                       || event.logMessageData?.value
                       || event.nickname;

      if (tId && tgId) {
        let guard = null;
        await withData(store => {
          if (store.profiles.threadSettings && store.profiles.threadSettings[tId] && store.profiles.threadSettings[tId].nicknameGuard) {
            guard = store.profiles.threadSettings[tId].nicknameGuard;
          }
        });

        if (guard && String(guard.userId) === String(tgId) && newNickname !== guard.nickname) {
          console.log(`[SIMULATOR] Wykryto zmianę pseudonimu dla ${tgId} na "${newNickname || '<brak>'}" w wątku ${tId}. Przywracanie do "${guard.nickname}"...`);
          let result = await new Promise((resolve) => {
            mockApi.changeNickname(guard.nickname, tId, tgId, (err) => {
              if (err) {
                console.error('[SIMULATOR ERROR]', err);
                resolve('ERROR');
              } else {
                console.log(`[SIMULATOR] Pomyślnie przywrócono pseudonim "${guard.nickname}".`);
                resolve('REVERTED');
              }
            });
          });
          return result;
        } else {
          console.log(`[SIMULATOR] Zdarzenie zignorowane. Powód: ${!guard ? 'brak strażnika' : String(guard.userId) !== String(tgId) ? 'inny użytkownik' : 'pseudonim zgodny z zablokowanym'}`);
          return 'NO_ACTION';
        }
      }
    }
    return 'NOT_NICKNAME_EVENT';
  }

  // Definicja mock api
  let changeNicknameCalls = [];
  const mockApi = {
    getCurrentUserID: () => botId,
    changeNickname: (nick, tId, tgId, cb) => {
      changeNicknameCalls.push({ nick, tId, tgId });
      cb(null);
    }
  };

  // TEST A: Użytkownik zmienia pseudonim na niepoprawny (log:thread-nickname)
  console.log('\n--- TEST A: Zmiana przez innego użytkownika (log:thread-nickname) ---');
  changeNicknameCalls = [];
  const eventA = {
    type: 'event',
    logMessageType: 'log:thread-nickname',
    threadID: threadId,
    author: 'some_other_user_111',
    logMessageData: {
      participant_id: targetId,
      nickname: 'ZlyNickA'
    }
  };
  let resA = await simulateEvent(eventA, mockApi);
  console.log('Wynik testu A:', resA);
  if (resA === 'REVERTED' && changeNicknameCalls.length === 1 && changeNicknameCalls[0].nick === guardNick) {
    console.log('✅ TEST A PASSED!');
  } else {
    console.error('❌ TEST A FAILED!');
  }

  // TEST B: Bot zmienia pseudonim na zablokowany (symulacja własnego zdarzenia po przywróceniu)
  console.log('\n--- TEST B: Zdarzenie wywołane przez samego bota (powinno być zignorowane) ---');
  changeNicknameCalls = [];
  const eventB = {
    type: 'event',
    logMessageType: 'log:thread-nickname',
    threadID: threadId,
    author: botId,
    logMessageData: {
      participant_id: targetId,
      nickname: guardNick
    }
  };
  let resB = await simulateEvent(eventB, mockApi);
  console.log('Wynik testu B:', resB);
  if (resB === 'IGNORED_SELF' && changeNicknameCalls.length === 0) {
    console.log('✅ TEST B PASSED!');
  } else {
    console.error('❌ TEST B FAILED!');
  }

  // TEST C: Zmiana przez innego użytkownika pod typem log:user-nickname (np. wyczyszczenie nicku)
  console.log('\n--- TEST C: Wyczyszczenie nicku (log:user-nickname) ---');
  changeNicknameCalls = [];
  const eventC = {
    type: 'event',
    logMessageType: 'log:user-nickname',
    threadID: threadId,
    author: 'some_other_user_111',
    logMessageData: {
      participant_id: targetId,
      nickname: '' // puste, czyli reset
    }
  };
  let resC = await simulateEvent(eventC, mockApi);
  console.log('Wynik testu C:', resC);
  if (resC === 'REVERTED' && changeNicknameCalls.length === 1 && changeNicknameCalls[0].nick === guardNick) {
    console.log('✅ TEST C PASSED!');
  } else {
    console.error('❌ TEST C FAILED!');
  }

  // TEST D: Zmiana nicku dla kogoś innego (kto nie jest chroniony)
  console.log('\n--- TEST D: Zmiana nicku niechronionego użytkownika ---');
  changeNicknameCalls = [];
  const eventD = {
    type: 'event',
    logMessageType: 'log:thread-nickname',
    threadID: threadId,
    author: 'some_other_user_111',
    logMessageData: {
      participant_id: 'random_user_999',
      nickname: 'InnyNick'
    }
  };
  let resD = await simulateEvent(eventD, mockApi);
  console.log('Wynik testu D:', resD);
  if (resD === 'NO_ACTION' && changeNicknameCalls.length === 0) {
    console.log('✅ TEST D PASSED!');
  } else {
    console.error('❌ TEST D FAILED!');
  }

  // Czyszczenie bazy testowej
  await withData(store => {
    if (store.profiles.threadSettings && store.profiles.threadSettings[threadId]) {
      delete store.profiles.threadSettings[threadId];
    }
  });

  console.log('\n=== TESTY UKOŃCZONE ===');
}

runTests().catch(console.error);
