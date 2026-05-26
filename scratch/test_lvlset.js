const lvlset = require('../commands/lvlset');
const assert = require('assert');
const { createUser, withData, getUser } = require('../utils/storage');
const { ensureInventoryRecord } = require('../utils/economy');

async function test() {
  console.log('--- Rozpoczynanie Testów Retroaktywnego Przyznawania Kamieni Milowych ---');

  const retroUserId = 'retro_test_user_unique';
  
  // 1. Ustawienie usera na level 30 z pustymi odebranymi nagrodami i czystym ekwipunkiem
  await withData(store => {
    delete store.users[retroUserId];
    delete store.inventory[retroUserId];
    
    const user = createUser(retroUserId, store.users);
    user.level = 30;
    user.xp = 0;
    user.balance = 0;
    user.claimedMilestones = []; // Pusta lista - symuluje gracza sprzed aktualizacji
  });

  console.log('✅ Utworzono użytkownika testowego (poziom 30, brak odebranych kamieni milowych).');

  // 2. Wywołanie withData (powinno uruchomić automatyczną migrację retroaktywną)
  await withData(store => {
    // Sama transakcja bazy danych powinna wyzwolić retroaktywną migrację w withData
  });

  // 3. Weryfikacja po migracji
  const userAfter = getUser(retroUserId);
  const invAfter = await withData(store => ensureInventoryRecord(store.inventory, retroUserId));

  console.log('Stan użytkownika po automatycznej migracji:');
  console.log('- Poziom:', userAfter.level);
  console.log('- Saldo portfela:', userAfter.balance, '(oczekiwane: 750000)');
  console.log('- Odebrane kamienie milowe:', userAfter.claimedMilestones, '(oczekiwane: [10, 20, 30])');
  console.log('- Ekwipunek (paczka_brazowa):', invAfter.paczka_brazowa, '(oczekiwane: 1)');
  console.log('- Ekwipunek (klodka):', invAfter.klodka, '(oczekiwane: 2 - 1 z lvl 20, 1 z lvl 30)');
  console.log('- Ekwipunek (bomba):', invAfter.bomba, '(oczekiwane: 1)');

  // Oczekiwana kasa:
  // Lvl 10: 150,000
  // Lvl 20: 250,000
  // Lvl 30: 350,000
  // Razem: 750,000
  assert.strictEqual(userAfter.balance, 750000);
  assert.strictEqual(invAfter.paczka_brazowa, 1);
  assert.strictEqual(invAfter.klodka, 2);
  assert.strictEqual(invAfter.bomba, 1);
  assert.deepStrictEqual(userAfter.claimedMilestones.sort(), [10, 20, 30]);

  console.log('✅ Zweryfikowano poprawne retroaktywne przyznanie wszystkich zaległych nagród i zaktualizowanieclaimedMilestones.');

  // 4. Druga transakcja: upewnijmy się, że nagrody nie zostaną przyznane ponownie
  await withData(store => {});
  const userSecond = getUser(retroUserId);
  assert.strictEqual(userSecond.balance, 750000);
  console.log('✅ Zweryfikowano, że ponowne transakcje nie dublują nagród (zabezpieczenie przed double-claim działa).');

  // 5. Testowanie lvlset
  const creatorId = '100060812419294';
  await withData(store => {
    const user = createUser(creatorId, store.users);
    user.level = 1;
    user.xp = 0;
    user.balance = 0;
    user.claimedMilestones = [];
    const inv = ensureInventoryRecord(store.inventory, creatorId);
    delete inv.paczka_brazowa;
    delete inv.klodka;
  });

  let replyMsg = '';
  const mockMessageSuccess = {
    author: { id: creatorId },
    async reply(msg) {
      replyMsg = msg;
    }
  };

  await lvlset.execute(null, mockMessageSuccess, ['20']);
  assert.ok(replyMsg.includes('OSIĄGNIĘTO KAMIEŃ MILOWY!'));
  
  const creatorUser = getUser(creatorId);
  assert.strictEqual(creatorUser.level, 20);
  assert.deepStrictEqual(creatorUser.claimedMilestones.sort(), [10, 20]);
  console.log('✅ Zweryfikowano działanie komendy !lvlset i poprawne zapisywanie claimedMilestones.');

  console.log('🎉 Wszystkie testy retroaktywnego systemu przeszły pomyślnie!');
}

test().catch(err => {
  console.error('❌ Test nie powiódł się:', err);
  process.exit(1);
});
