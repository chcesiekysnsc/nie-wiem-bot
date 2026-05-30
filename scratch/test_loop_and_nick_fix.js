const { withData } = require('../utils/storage');

async function runTests() {
  console.log('=== TESTY POPRAWKI OMIJANIA NICKU ORAZ INTERCEPTORA LOOP ===\n');

  const threadId = 'test_thread_555';
  const targetId = 'target_user_666';
  const botId = 'bot_user_789';
  const guardNick = 'ZablokowanyNick';

  // 1. Przygotowanie bazy danych z guardnick oraz loop
  await withData(store => {
    store.profiles.threadSettings = store.profiles.threadSettings || {};
    store.profiles.threadSettings[threadId] = {
      nicknameGuard: {
        userId: targetId,
        nickname: guardNick
      },
      loopUsers: [targetId]
    };
  });

  console.log('Baza danych skonfigurowana. Użytkownik', targetId, 'jest zapętlony i ma zablokowany nick:', guardNick);

  // Funkcja symulująca logikę obsługi pseudonimów z self_bot.js
  async function simulateNicknameEvent(event, mockApi) {
    const isNicknameEvent = (event.type === 'event' && (event.logMessageType === 'log:thread-nickname' || event.logMessageType === 'log:user-nickname')) 
                         || (event.type === 'log:thread-nickname' || event.type === 'log:user-nickname');
    if (isNicknameEvent) {
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

        // Ignoruj zmiany wykonane przez samego bota tylko wtedy, gdy przywrócił poprawny zablokowany nick (zapobiega pętlom)
        const currentBotId = typeof mockApi.getCurrentUserID === 'function' ? mockApi.getCurrentUserID() : '';
        if (guard && currentBotId && event.author && String(event.author) === String(currentBotId) && newNickname === guard.nickname) {
          console.log(`[SIMULATOR] Ignoruję własną zmianę pseudonimu bota na zablokowany (newNickname === guard.nickname)`);
          return 'IGNORED_SELF';
        }

        if (guard && String(guard.userId) === String(tgId) && newNickname !== guard.nickname) {
          console.log(`[SIMULATOR] Przywracam pseudonim do "${guard.nickname}"...`);
          await new Promise((resolve) => {
            mockApi.changeNickname(guard.nickname, tId, tgId, () => resolve());
          });
          return 'REVERTED';
        }
      }
    }
    return 'NO_ACTION';
  }

  // Funkcja symulująca logikę wyjścia z grupy (log:unsubscribe)
  async function simulateUnsubscribeEvent(event, mockApi) {
    const isUnsubscribeEvent = (event.type === 'event' && event.logMessageType === 'log:unsubscribe') || (event.type === 'log:unsubscribe');
    if (isUnsubscribeEvent) {
      const tId = event.threadID;
      
      const removedUsers = [];
      if (event.logMessageData?.leftParticipantFbId) {
        removedUsers.push(String(event.logMessageData.leftParticipantFbId));
      }

      const dataParticipants = event.logMessageData?.removedParticipants;
      if (Array.isArray(dataParticipants)) {
        for (const p of dataParticipants) {
          if (p && typeof p === 'object') {
            const uid = p.userFbId || p.userID || p.id;
            if (uid) removedUsers.push(String(uid));
          } else if (p) {
            removedUsers.push(String(p));
          }
        }
      }
      if (event.participantID) {
        removedUsers.push(String(event.participantID));
      }
      if (event.targetID) {
        removedUsers.push(String(event.targetID));
      }

      const uniqueRemoved = [...new Set(removedUsers)];

      if (tId && uniqueRemoved.length > 0) {
        let loopUsers = [];
        await withData(store => {
          if (store.profiles.threadSettings && store.profiles.threadSettings[tId] && store.profiles.threadSettings[tId].loopUsers) {
            loopUsers = [...store.profiles.threadSettings[tId].loopUsers];
          }
        });

        if (loopUsers.length > 0) {
          for (const userId of uniqueRemoved) {
            if (loopUsers.includes(userId)) {
              console.log(`[SIMULATOR] Zapętlony użytkownik ${userId} wyszedł. Dodawanie z powrotem...`);
              await new Promise((resolve) => {
                mockApi.addUserToGroup(userId, tId, () => resolve());
              });
              return 'ADDED_BACK';
            }
          }
        }
      }
    }
    return 'NO_ACTION';
  }

  // Mock API
  let changeNicknameCalls = [];
  let addUserCalls = [];
  const mockApi = {
    getCurrentUserID: () => botId,
    changeNickname: (nick, tId, tgId, cb) => {
      changeNicknameCalls.push({ nick, tId, tgId });
      cb(null);
    },
    addUserToGroup: (uid, tId, cb) => {
      addUserCalls.push({ uid, tId });
      cb(null);
    }
  };

  // TEST 1: Zmiana przez samego bota na INNY nick (np. wywołana komendą !nick @target InnyNick)
  console.log('\n--- TEST 1: Bot zmienia nick na inny (wywołanie !nick) ---');
  changeNicknameCalls = [];
  const event1 = {
    type: 'event',
    logMessageType: 'log:thread-nickname',
    threadID: threadId,
    author: botId,
    logMessageData: {
      participant_id: targetId,
      nickname: 'InnyNickZKomendy'
    }
  };
  let res1 = await simulateNicknameEvent(event1, mockApi);
  console.log('Wynik Testu 1:', res1);
  if (res1 === 'REVERTED' && changeNicknameCalls.length === 1 && changeNicknameCalls[0].nick === guardNick) {
    console.log('✅ TEST 1 PASSED! (Bot przywrócił nick mimo że sam go zmienił komendą)');
  } else {
    console.error('❌ TEST 1 FAILED!');
  }

  // TEST 2: Zmiana przez samego bota na ZABLOKOWANY nick (wywołana przez mechanizm przywracania)
  console.log('\n--- TEST 2: Bot przywraca zablokowany nick (wywołanie przywracania) ---');
  changeNicknameCalls = [];
  const event2 = {
    type: 'event',
    logMessageType: 'log:thread-nickname',
    threadID: threadId,
    author: botId,
    logMessageData: {
      participant_id: targetId,
      nickname: guardNick
    }
  };
  let res2 = await simulateNicknameEvent(event2, mockApi);
  console.log('Wynik Testu 2:', res2);
  if (res2 === 'IGNORED_SELF' && changeNicknameCalls.length === 0) {
    console.log('✅ TEST 2 PASSED! (Zignorowano własną zmianę na zablokowany nick, brak pętli)');
  } else {
    console.error('❌ TEST 2 FAILED!');
  }

  // TEST 3: Wyjście użytkownika zapętlonego z grupy (usunięcie przez kogoś)
  console.log('\n--- TEST 3: Zapętlony użytkownik zostaje wyrzucony z grupy ---');
  addUserCalls = [];
  const event3 = {
    type: 'event',
    logMessageType: 'log:unsubscribe',
    threadID: threadId,
    author: 'some_admin',
    logMessageData: {
      removedParticipants: [
        {
          userFbId: targetId,
          fullName: 'Test User'
        }
      ]
    }
  };
  let res3 = await simulateUnsubscribeEvent(event3, mockApi);
  console.log('Wynik Testu 3:', res3);
  if (res3 === 'ADDED_BACK' && addUserCalls.length === 1 && addUserCalls[0].uid === targetId) {
    console.log('✅ TEST 3 PASSED! (Użytkownik został automatycznie dodany z powrotem)');
  } else {
    console.error('❌ TEST 3 FAILED!');
  }

  // TEST 4: Wyjście niezapętlonego użytkownika
  console.log('\n--- TEST 4: Niezapętlony użytkownik wychodzi z grupy ---');
  addUserCalls = [];
  const event4 = {
    type: 'event',
    logMessageType: 'log:unsubscribe',
    threadID: threadId,
    author: 'random_user_111',
    logMessageData: {
      removedParticipants: [
        {
          userFbId: 'random_user_111',
          fullName: 'Random User'
        }
      ]
    }
  };
  let res4 = await simulateUnsubscribeEvent(event4, mockApi);
  console.log('Wynik Testu 4:', res4);
  if (res4 === 'NO_ACTION' && addUserCalls.length === 0) {
    console.log('✅ TEST 4 PASSED!');
  } else {
    console.error('❌ TEST 4 FAILED!');
  }

  // TEST 5: Dobrowolne wyjście użytkownika zapętlonego z grupy (leftParticipantFbId)
  console.log('\n--- TEST 5: Zapętlony użytkownik dobrowolnie opuszcza grupę ---');
  addUserCalls = [];
  const event5 = {
    type: 'event',
    logMessageType: 'log:unsubscribe',
    threadID: threadId,
    author: targetId,
    logMessageData: {
      leftParticipantFbId: targetId
    }
  };
  let res5 = await simulateUnsubscribeEvent(event5, mockApi);
  console.log('Wynik Testu 5:', res5);
  if (res5 === 'ADDED_BACK' && addUserCalls.length === 1 && addUserCalls[0].uid === targetId) {
    console.log('✅ TEST 5 PASSED! (Dobrowolnie odchodzący użytkownik został dodany z powrotem)');
  } else {
    console.error('❌ TEST 5 FAILED!');
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
