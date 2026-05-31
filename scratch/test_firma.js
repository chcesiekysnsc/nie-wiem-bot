const { withData } = require('../utils/storage');
const config = require('../config/config');

async function runTest() {
  console.log('=== URUCHAMIANIE TESTÓW SYSTEMU FIRM (!firma) ===\n');

  const testUserId = 'test_firma_user_999';
  let success = true;

  // 1. Czyszczenie starych danych testowych
  await withData(store => {
    delete store.users[testUserId];
    delete store.inventory[testUserId];
  });

  const command = require('../commands/firma');
  const helpSystem = require('../utils/helpSystem');

  // --- TEST 0: Blokada czasowa przed 1 czerwca ---
  console.log('Test 0: Weryfikacja ukrycia komendy i pomocy przed 1 czerwca...');
  const helpResultBefore = helpSystem.getHelpCommandByName('firma');
  if (helpResultBefore === null) {
    console.log('   ✅ Test 0A: Komenda ukryta w systemie pomocy przed 1 czerwca.');
  } else {
    console.error('   ❌ BŁĄD: Komenda jest widoczna w systemie pomocy przed czasem!');
    success = false;
  }

  const mockMessage0 = {
    author: { id: testUserId },
    reply: async (msg) => {
      console.log('   ↳ Odpowiedź bota:', typeof msg === 'object' ? JSON.stringify(msg) : msg);
      const msgStr = typeof msg === 'object' ? JSON.stringify(msg) : String(msg);
      if (msgStr.includes('Nieznana komenda')) {
        console.log('   ✅ Test 0B: Bot zgłosił błąd nieznanej komendy przed czasem.');
      } else {
        console.error('   ❌ BŁĄD: Bot nie zgłosił błędu nieznanej komendy!');
        success = false;
      }
    }
  };
  await command.execute(null, mockMessage0, []);

  // --- TEST 1: Zakup przy braku środków ---
  console.log('\nTest 1: Próba zakupu przy braku środków (z pominięciem blokady czasowej)...');
  // Ponieważ w prawdziwym teście zakupów i zbiórki musimy "ominąć" blokadę czasową, 
  // tymczasowo podmieniamy Date.now w skrypcie testowym lub mockujemy czas!
  const realDateNow = Date.now;
  Date.now = () => 1780264801000; // Ustawiamy czas na tuż po 1 czerwca 00:00

  await withData(store => {
    store.users[testUserId] = {
      id: testUserId,
      balance: 1000, // Za mało na Kiosk (cena 2M)
      bank: 0,
      level: 1,
      xp: 0
    };
  });

  const mockMessage = {
    author: { id: testUserId },
    reply: async (msg) => {
      console.log('   ↳ Odpowiedź bota:', msg.replace(/\n/g, ' | '));
      if (msg.includes('Brak wystarczających środków')) {
        console.log('   ✅ Test 1 zaliczony (zakup zablokowany).');
      } else {
        console.error('   ❌ BŁĄD w teście 1: oczekiwano zablokowania zakupu.');
        success = false;
      }
    }
  };

  await command.execute(null, mockMessage, ['kup', 'kiosk']);

  // --- TEST 2: Udany zakup firmy ---
  console.log('\nTest 2: Udany zakup Kiosku za 2 000 000 monet...');
  await withData(store => {
    store.users[testUserId].balance = 3000000; // Doładowanie monet
  });

  const mockMessage2 = {
    author: { id: testUserId },
    reply: async (msg) => {
      console.log('   ↳ Odpowiedź bota:', msg.replace(/\n/g, ' | '));
      if (msg.includes('Pomyślnie kupiono firmę') && msg.includes('Kiosk')) {
        console.log('   ✅ Test 2 zaliczony (zakup udany).');
      } else {
        console.error('   ❌ BŁĄD w teście 2: zakup nie powiódł się.');
        success = false;
      }
    }
  };

  await command.execute(null, mockMessage2, ['kup', 'kiosk']);

  // Zweryfikuj stan w bazie
  await withData(store => {
    const user = store.users[testUserId];
    if (user.company && user.company.id === 'kiosk' && user.balance === 1000000) {
      console.log('   ✅ Baza danych zaktualizowana poprawnie (saldo: 1 000 000, firma: kiosk).');
    } else {
      console.error('   ❌ BŁĄD: dane w bazie się nie zgadzają:', user.company, user.balance);
      success = false;
    }
  });

  // --- TEST 3: Blokada zakupu drugiej firmy ---
  console.log('\nTest 3: Próba zakupu drugiej firmy (restauracja) przy posiadaniu Kiosku...');
  await withData(store => {
    store.users[testUserId].balance = 5000000; // Doładowanie
  });

  const mockMessage3 = {
    author: { id: testUserId },
    reply: async (msg) => {
      console.log('   ↳ Odpowiedź bota:', msg.replace(/\n/g, ' | '));
      if (msg.includes('Posiadasz już firmę') && msg.includes('Kiosk')) {
        console.log('   ✅ Test 3 zaliczony (zakup zablokowany).');
      } else {
        console.error('   ❌ BŁĄD w teście 3: zakup drugiej firmy nie został zablokowany.');
        success = false;
      }
    }
  };

  await command.execute(null, mockMessage3, ['kup', 'restauracja']);

  // --- TEST 4: Pierwsza darmowa wypłata od razu po zakupie ---
  console.log('\nTest 4: Pobranie pierwszej wypłaty z nowo kupionej firmy (powinno być od razu gotowe)...');
  const mockMessage4 = {
    author: { id: testUserId },
    reply: async (msg) => {
      console.log('   ↳ Odpowiedź bota:', msg.replace(/\n/g, ' | '));
      if (msg.includes('Zebrałeś wypłatę') && msg.includes('45')) {
        console.log('   ✅ Test 4 zaliczony (wypłata odebrana).');
      } else {
        console.error('   ❌ BŁĄD w teście 4: wypłata nie powiodła się.');
        success = false;
      }
    }
  };

  // Upewniamy się, że nie jest zepsuta na potrzeby tego testu
  await withData(store => {
    store.users[testUserId].company.isBroken = false;
  });

  await command.execute(null, mockMessage4, ['zbierz']);

  // --- TEST 5: Blokada wypłaty z powodu cooldownu ---
  console.log('\nTest 5: Próba ponownego pobrania wypłaty natychmiast po poprzedniej...');
  const mockMessage5 = {
    author: { id: testUserId },
    reply: async (msg) => {
      console.log('   ↳ Odpowiedź bota:', msg.replace(/\n/g, ' | '));
      if (msg.includes('cooldownMs') || msg.includes('Wróć za')) {
        console.log('   ✅ Test 5 zaliczony (blokada cooldownu działa).');
      } else {
        console.error('   ❌ BŁĄD w teście 5: cooldown nie zadziałał.');
        success = false;
      }
    }
  };

  await command.execute(null, mockMessage5, ['zbierz']);

  // --- TEST 6: Zablokowanie wypłaty z powodu awarii i konieczność naprawy ---
  console.log('\nTest 6: Ustawienie firmy jako zepsutej i próba wypłaty, a następnie naprawa...');
  await withData(store => {
    store.users[testUserId].company.isBroken = true;
    store.users[testUserId].company.lastPayout = Date.now() - 4 * 3600 * 1000; // minęło 4h (cooldown minął)
    store.users[testUserId].balance = 500000; // Ustawienie stałego salda
  });

  const mockMessage6A = {
    author: { id: testUserId },
    reply: async (msg) => {
      console.log('   ↳ Odpowiedź bota (blokada awarii):', msg.replace(/\n/g, ' | '));
      if (msg.includes('uległa awarii') && msg.includes('Koszt naprawy')) {
        console.log('   ✅ Test 6A zaliczony (awaria blokuje wypłatę).');
      } else {
        console.error('   ❌ BŁĄD w teście 6A: zepsuta firma pozwoliła na wypłatę.');
        success = false;
      }
    }
  };

  await command.execute(null, mockMessage6A, ['zbierz']);

  // Naprawa firmy
  const mockMessage6B = {
    author: { id: testUserId },
    reply: async (msg) => {
      console.log('   ↳ Odpowiedź bota (naprawa):', msg.replace(/\n/g, ' | '));
      if (msg.includes('Pomyślnie naprawiono firmę') && msg.includes('Kiosk')) {
        console.log('   ✅ Test 6B zaliczony (naprawa powiodła się).');
      } else {
        console.error('   ❌ BŁĄD w teście 6B: naprawa nie powiodła się.');
        success = false;
      }
    }
  };

  await command.execute(null, mockMessage6B, ['napraw']);

  // Sprawdź czy po naprawie jest sprawna i saldo spadło o 180 000 (4 * 45 000)
  await withData(store => {
    const user = store.users[testUserId];
    if (user.company && !user.company.isBroken && user.balance === 320000) {
      console.log('   ✅ Test 6C zaliczony: stan firmy w bazie sprawny, pobrano 180k.');
    } else {
      console.error('   ❌ BŁĄD w teście 6C: nieprawidłowe saldo lub stan po naprawie:', user.balance, user.company);
      success = false;
    }
  });

  // --- TEST 7: Sprzedaż firmy ---
  console.log('\nTest 7: Sprzedaż Kiosku (cena 2M, oczekiwany zwrot 1M)...');
  const mockMessage7 = {
    author: { id: testUserId },
    reply: async (msg) => {
      console.log('   ↳ Odpowiedź bota:', msg.replace(/\n/g, ' | '));
      if (msg.includes('Sprzedano firmę') && msg.includes('Kiosk')) {
        console.log('   ✅ Test 7 zaliczony (sprzedaż udana).');
      } else {
        console.error('   ❌ BŁĄD w teście 7: sprzedaż nie udała się.');
        success = false;
      }
    }
  };

  await command.execute(null, mockMessage7, ['sprzedaj']);

  await withData(store => {
    const user = store.users[testUserId];
    if (user.company === null && user.balance === 1320000) {
      console.log('   ✅ Test 7B zaliczony: firma usunięta z bazy, dodano 1M do salda.');
    } else {
      console.error('   ❌ BŁĄD w teście 7B: niepoprawny stan po sprzedaży:', user.balance, user.company);
      success = false;
    }
  });

  // --- TEST 8: Reset miesięczny ---
  console.log('\nTest 8: Symulacja miesięcznego resetu...');
  await withData(store => {
    // Ponownie kupujemy Kiosk dla testu
    store.users[testUserId].company = {
      id: 'kiosk',
      boughtAt: Date.now(),
      lastPayout: Date.now(),
      isBroken: false
    };
    store.profiles.lastResetYear = 2026;
    store.profiles.lastResetMonth = 3; // poprzedni miesiąc
  });

  // Uruchom withData, co automatycznie wyzwoli performMonthlyReset
  await withData(async (store) => {
    console.log('   (Wymuszono reset poprzez withData)');
  });

  // Zweryfikuj czy firma została wyczyszczona
  await withData(store => {
    const user = store.users[testUserId];
    if (user.company === null) {
      console.log('   ✅ Test 8 zaliczony: firma została zresetowana na nowo.');
    } else {
      console.error('   ❌ BŁĄD w teście 8: firma przetrwała reset miesięczny!', user.company);
      success = false;
    }
  });

  // --- CZYSZCZENIE PO TESTACH ---
  Date.now = realDateNow;
  await withData(store => {
    delete store.users[testUserId];
  });

  console.log('\n--- WYNIK KOŃCOWY ---');
  if (success) {
    console.log('🎉 WSZYSTKIE TESTY SYSTEMU FIRM ZAKOŃCZYŁY SIĘ SUKCESEM!');
  } else {
    console.error('❌ NIEKTÓRE TESTY SYSTEMU FIRM ZAKOŃCZYŁY SIĘ NIEPOWODZENIEM.');
  }
}

runTest().catch(console.error);
