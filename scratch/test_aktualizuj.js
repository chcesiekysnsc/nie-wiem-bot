const { withData } = require('../utils/storage');
const config = require('../config/config');

async function runTest() {
  console.log('=== URUCHAMIANIE TESTÓW KOMENDY !AKTUALIZUJ ===\n');

  const testUserId = 'test_aktualizuj_user_888';
  const testThreadId = 'test_aktualizuj_thread_777';
  let success = true;

  // 1. Czyszczenie bazy
  await withData(store => {
    delete store.users[testUserId];
  });

  const command = require('../commands/aktualizuj');

  // 2. Mockowanie client i api
  const mockClient = {
    config,
    commands: new Map([
      ['work', {}],
      ['crime', {}],
      ['slots', {}]
    ]),
    userNames: new Map([
      [testUserId, 'TestowyGracz']
    ]),
    resolveUserName: async (api, userId) => {
      if (userId === testUserId) return 'TestowyGracz';
      return `Gracz_${userId.slice(-6)}`;
    },
    api: {
      getCurrentUserID: () => 'bot_user_id_123',
      getThreadHistory: (threadID, amount, timestamp, callback) => {
        // Zwracamy listę testowych wiadomości z historii
        const history = [
          { senderID: testUserId, body: 'Cześć co tam', timestamp: Date.now() - 10000 },
          { senderID: testUserId, body: '!work', timestamp: Date.now() - 8000 },
          { senderID: testUserId, body: '!crime', timestamp: Date.now() - 6000 },
          { senderID: testUserId, body: '!slots 500', timestamp: Date.now() - 4000 },
          { senderID: testUserId, body: '!nonexistentcmd', timestamp: Date.now() - 2000 }, // Niezarejestrowana komenda
          { senderID: 'bot_user_id_123', body: 'Bot reply', timestamp: Date.now() - 1000 } // Wiadomość bota (powinna być ignorowana)
        ];
        callback(null, history);
      }
    }
  };

  const mockMessage = {
    author: { id: config.admins[0] }, // Zezwól jako admin bota
    guild: { id: testThreadId },
    reply: async (msg) => {
      console.log('   ↳ Odpowiedź bota:', typeof msg === 'object' ? JSON.stringify(msg) : msg.replace(/\n/g, ' | '));
      if (msg.includes('ODZYSKIWANIE STATYSTYK ZAKOŃCZYŁY SIĘ') || msg.includes('ODZYSKIWANIE STATYSTYK ZAKOŃCZONE')) {
        console.log('   ✅ Otrzymano poprawny raport końcowy.');
      }
    }
  };

  // Uruchomienie komendy
  await command.execute(mockClient, mockMessage, []);

  // 3. Weryfikacja bazy danych
  await withData(store => {
    const user = store.users[testUserId];
    if (user) {
      // Łącznie zanalizowaliśmy 5 wiadomości wysłanych przez testUserId (Cześć, !work, !crime, !slots, !nonexistentcmd)
      // Z tego: 3 to były zarejestrowane komendy (work, crime, slots)
      if (user.messageCount === 5) {
        console.log('   ✅ Test 1 zaliczony: Zliczono poprawnie 5 wiadomości użytkownika.');
      } else {
        console.error('   ❌ BŁĄD w teście 1: Niepoprawna liczba wiadomości:', user.messageCount);
        success = false;
      }

      if (user.commandsUsed === 3) {
        console.log('   ✅ Test 2 zaliczony: Zliczono poprawnie 3 komendy użytkownika.');
      } else {
        console.error('   ❌ BŁĄD w teście 2: Niepoprawna liczba użytych komend:', user.commandsUsed);
        success = false;
      }

      const counts = user.commandCounts || {};
      if (counts.work === 1 && counts.crime === 1 && counts.slots === 1 && !counts.nonexistentcmd) {
        console.log('   ✅ Test 3 zaliczony: Liczniki poszczególnych komend są prawidłowe.');
      } else {
        console.error('   ❌ BŁĄD w teście 3: Błędne statystyki konkretnych komend:', counts);
        success = false;
      }
    } else {
      console.error('   ❌ BŁĄD: Użytkownik nie został utworzony w bazie po odzyskiwaniu.');
      success = false;
    }
  });

  // Czyszczenie po testach
  await withData(store => {
    delete store.users[testUserId];
  });

  console.log('\n--- WYNIK KOŃCOWY ---');
  if (success) {
    console.log('🎉 WSZYSTKIE TESTY KOMENDY !AKTUALIZUJ ZAKOŃCZYŁY SIĘ SUKCESEM!');
  } else {
    console.error('❌ NIEKTÓRE TESTY KOMENDY !AKTUALIZUJ ZAKOŃCZYŁY SIĘ NIEPOWODZENIEM.');
  }
}

runTest().catch(console.error);
