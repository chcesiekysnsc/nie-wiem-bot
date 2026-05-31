const { withData } = require('../utils/storage');

async function runTest() {
  console.log('=== URUCHAMIANIE TESTU RESETU MIESIĘCZNEGO ===\n');

  const testUserId = 'test_reset_user_111';
  const testBannedUserId = 'test_reset_banned_333';
  const testGangId = 'test_reset_gang_222';

  // 1. KROK: Przygotowanie danych testowych w bazie
  await withData(store => {
    // Kopiujemy obecną datę resetu, aby móc ją zmienić
    store.profiles.lastResetYear = 2026;
    store.profiles.lastResetMonth = 3; // Ustawiamy na poprzedni miesiąc (Kwiecień, index 3), aby wywołać reset (obecny to Maj, index 4 lub Czerwiec, index 5)

    // Dodajemy pierwszego testowego użytkownika ze specyficznymi danymi
    store.users[testUserId] = {
      id: testUserId,
      balance: 999999, // Dużo pieniędzy
      bank: 555555,    // Dużo w banku
      level: 15,
      xp: 120,
      activeLoan: { amount: 100000, takenAt: Date.now() - 3600 * 1000, rate: 0.1 }, // Aktywny dług
      badges: ['👑 VIP', '🏆 Zwycięzca', 'CustomBadge'], // Odznaki
      commandsUsed: 150,
      messageCount: 300,
      commandCounts: { work: 10, crime: 15 }
    };

    // Dodajemy drugiego testowego użytkownika, który jest zbanowany za ujemne saldo
    store.users[testBannedUserId] = {
      id: testBannedUserId,
      balance: -25000, // Ujemny stan konta
      bank: 0,
      level: 5,
      xp: 240,
      negativeSince: Date.now() - 8 * 24 * 60 * 60 * 1000, // Ponad 7 dni ujemnego salda
      blacklistedForNegativeBalance: true,
      badges: []
    };

    // Dodajemy zbanowanego użytkownika do listy zbanowanych (blacklist)
    store.profiles.blacklist = store.profiles.blacklist || [];
    if (!store.profiles.blacklist.includes(testBannedUserId)) {
      store.profiles.blacklist.push(testBannedUserId);
    }

    // Dodajemy przedmioty do ekwipunku pierwszego testowego użytkownika
    store.inventory[testUserId] = {
      vip: 1, // Resetowalny
      sejf: 2, // Resetowalny
      szkarlatne_oko: 1, // Sezonowy/Stały (Event)
      cien_nocy: 1, // Sezonowy/Stały (Event)
      wampirzy_sztylet: 1, // Sezonowy/Stały (Event)
      szwajcarski_klucz: 1, // Sezonowy/Stały (Event)
      krysztal_doswiadczenia: 1, // Sezonowy/Stały (Event)
      paczka_zlota: 5, // Normalny przedmiot -> powinien zostać usunięty
      piwo: 10, // Normalny przedmiot -> powinien zostać usunięty
      klodka: 3 // Normalny przedmiot -> powinien zostać usunięty
    };

    // Dodajemy gang testowy
    store.profiles.gangs = store.profiles.gangs || {};
    store.profiles.gangs[testGangId] = {
      name: 'ResetTestGang',
      bossId: testUserId,
      members: [testUserId],
      vault: 888888, // Pieniądze gangu -> powinny zostać wyzerowane
      levelDziupla: 5, // Ulepszenie -> powinno zostać wyzerowane
      levelBiznesy: 3, // Ulepszenie -> powinno zostać wyzerowane
      levelFach: 2 // Ulepszenie -> powinno zostać wyzerowane
    };
  });

  console.log('Dane testowe zostały przygotowane.');

  // 2. KROK: Wywołanie operacji na bazie danych, która wymusi uruchomienie logiki withData
  // Ponieważ w kroku 1 ustawiliśmy store.profiles.lastResetMonth na poprzedni miesiąc,
  // kolejne wywołanie withData wykryje zmianę miesiąca i automatycznie wyzwoli performMonthlyReset!
  await withData(async (store) => {
    console.log('Wywołano withData. Sprawdzanie czy reset został uruchomiony...');
  });

  // 3. KROK: Weryfikacja stanu bazy po resecie
  let userAfter = null;
  let userBannedAfter = null;
  let invAfter = null;
  let gangAfter = null;
  let profilesAfter = null;

  await withData(store => {
    userAfter = store.users[testUserId] ? { ...store.users[testUserId] } : null;
    userBannedAfter = store.users[testBannedUserId] ? { ...store.users[testBannedUserId] } : null;
    invAfter = store.inventory[testUserId] ? { ...store.inventory[testUserId] } : null;
    gangAfter = store.profiles.gangs && store.profiles.gangs[testGangId] ? { ...store.profiles.gangs[testGangId] } : null;
    profilesAfter = { ...store.profiles };
  });

  console.log('\n--- WERYFIKACJA WYNIKÓW ---');
  let success = true;

  // A. Sprawdzenie daty ostatniego resetu
  const currentDate = new Date();
  if (profilesAfter.lastResetYear === currentDate.getFullYear() && profilesAfter.lastResetMonth === currentDate.getMonth()) {
    console.log('✅ Zaktualizowano datę ostatniego resetu w bazie.');
  } else {
    console.error('❌ Data ostatniego resetu nie została zaktualizowana.');
    success = false;
  }

  // B. Sprawdzenie salda i banku użytkownika
  if (userAfter) {
    if (userAfter.balance === 5000 && userAfter.bank === 10000) {
      console.log('✅ Saldo (5k) i normalny bank (10k) zostały zresetowane do domyślnych wartości.');
    } else {
      console.error('❌ Saldo lub bank mają błędne wartości po resecie:', { balance: userAfter.balance, bank: userAfter.bank });
      success = false;
    }

    if (userAfter.activeLoan === null) {
      console.log('✅ Długi i pożyczki użytkownika zostały usunięte.');
    } else {
      console.error('❌ Aktywny dług nadal istnieje:', userAfter.activeLoan);
      success = false;
    }

    // Odznaka VIP powinna zostać usunięta, ponieważ VIP Pass został skasowany z EQ
    if (!userAfter.badges.includes('👑 VIP')) {
      console.log('✅ Odznaka VIP została prawidłowo usunięta po usunięciu VIP Pass z ekwipunku.');
    } else {
      console.error('❌ Odznaka VIP nadal istnieje po resecie.');
      success = false;
    }
  } else {
    console.error('❌ Użytkownik testowy nie istnieje w bazie.');
    success = false;
  }

  // C. Sprawdzenie unbanowania zablokowanego użytkownika
  if (userBannedAfter) {
    if (userBannedAfter.balance === 5000 && userBannedAfter.bank === 10000) {
      console.log('✅ Saldo i bank zbanowanego użytkownika zostały zresetowane do wartości dodatnich (5k / 10k).');
    } else {
      console.error('❌ Saldo zbanowanego użytkownika ma złe wartości:', userBannedAfter);
      success = false;
    }

    if (userBannedAfter.negativeSince === null && userBannedAfter.blacklistedForNegativeBalance === null) {
      console.log('✅ Wskaźniki ujemnego salda (negativeSince, blacklistedForNegativeBalance) zostały wyczyszczone.');
    } else {
      console.error('❌ Wskaźniki ujemnego salda nie zostały wyczyszczone:', {
        negativeSince: userBannedAfter.negativeSince,
        blacklistedForNegativeBalance: userBannedAfter.blacklistedForNegativeBalance
      });
      success = false;
    }

    const isStillBlacklisted = profilesAfter.blacklist.includes(testBannedUserId);
    if (!isStillBlacklisted) {
      console.log('✅ Użytkownik został pomyślnie usunięty z listy zbanowanych (blacklist). Może grać normalnie.');
    } else {
      console.error('❌ Użytkownik nadal figuruje na liście zbanowanych (blacklist)!');
      success = false;
    }
  } else {
    console.error('❌ Zbanowany użytkownik nie istnieje w bazie po resecie.');
    success = false;
  }

  // D. Sprawdzenie ekwipunku (sezonowe zostają, reszta do usunięcia)
  if (invAfter) {
    const keepKeys = ['szkarlatne_oko', 'cien_nocy', 'wampirzy_sztylet', 'szwajcarski_klucz', 'krysztal_doswiadczenia'];
    const keptItems = Object.keys(invAfter);
    const hasUnwantedItems = keptItems.some(k => !keepKeys.includes(k));

    if (!hasUnwantedItems) {
      console.log('✅ Wszystkie standardowe przedmioty (w tym VIP i Sejf) zostały usunięte z ekwipunku.');
    } else {
      console.error('❌ Wykryto nieusunięte przedmioty w ekwipunku:', keptItems.filter(k => !keepKeys.includes(k)));
      success = false;
    }

    const hasAllEventItems = keepKeys.every(k => invAfter[k] > 0);
    if (hasAllEventItems) {
      console.log('✅ Wszystkie przedmioty sezonowe/eventowe (TOP 1-5) zostały zachowane w ekwipunku.');
    } else {
      console.error('❌ Niektóre przedmioty sezonowe zostały usunięte z ekwipunku:', invAfter);
      success = false;
    }
  } else {
    console.error('❌ Ekwipunek użytkownika nie istnieje.');
    success = false;
  }

  // E. Sprawdzenie gangów
  if (gangAfter) {
    console.log('✅ Gang testowy nie został usunięty (struktura gangu pozostała).');
    if (gangAfter.vault === 0) {
      console.log('✅ Sejf gangu został wyzerowany.');
    } else {
      console.error('❌ Sejf gangu nie został wyzerowany:', gangAfter.vault);
      success = false;
    }

    if (gangAfter.levelDziupla === 0 && gangAfter.levelBiznesy === 0 && gangAfter.levelFach === 0) {
      console.log('✅ Wszystkie ulepszenia gangu zostały zresetowane do 0.');
    } else {
      console.error('❌ Błąd resetu ulepszeń gangu:', {
        levelDziupla: gangAfter.levelDziupla,
        levelBiznesy: gangAfter.levelBiznesy,
        levelFach: gangAfter.levelFach
      });
      success = false;
    }
  } else {
    console.error('❌ Gang testowy został całkowicie usunięty z bazy danych!');
    success = false;
  }

  // 4. KROK: Czyszczenie bazy po testach
  await withData(store => {
    delete store.users[testUserId];
    delete store.users[testBannedUserId];
    delete store.inventory[testUserId];
    if (store.profiles.gangs) {
      delete store.profiles.gangs[testGangId];
    }
    if (store.profiles.blacklist) {
      store.profiles.blacklist = store.profiles.blacklist.filter(id => id !== testBannedUserId);
    }
  });

  if (success) {
    console.log('\n🎉 WSZYSTKIE TESTY RESETU ZAKOŃCZYŁY SIĘ SUKCESEM! RESET MIESIĘCZNY DZIAŁA W 100% POPRAWNIE.');
  } else {
    console.error('\n❌ NIEKTÓRE TESTY RESETU ZAKOŃCZYŁY SIĘ NIEPOWODZENIEM.');
  }
}

runTest().catch(console.error);
