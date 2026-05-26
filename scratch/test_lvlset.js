const lvlset = require('../commands/lvlset');
const assert = require('assert');

async function test() {
  console.log('--- Testowanie komendy !lvlset ---');

  // 1. Test autoryzacji: inny użytkownik powinien zostać odrzucony
  let replyCalled = false;
  let replyMsg = '';
  const mockMessageFailure = {
    author: { id: '99999999999999' },
    async reply(msg) {
      replyCalled = true;
      replyMsg = msg;
    }
  };

  await lvlset.execute(null, mockMessageFailure, ['50']);
  assert.strictEqual(replyCalled, true);
  assert.ok(replyMsg.includes('Brak uprawnień'));
  console.log('✅ Poprawnie odrzucono nieuprawnionego użytkownika.');

  // 2. Test autoryzacji: twórca powinien przejść pomyślnie
  replyCalled = false;
  replyMsg = '';
  const mockMessageSuccess = {
    author: { id: '100060812419294' },
    async reply(msg) {
      replyCalled = true;
      replyMsg = msg;
    }
  };

  // Najpierw przetestujmy niepoprawny poziom
  await lvlset.execute(null, mockMessageSuccess, ['abc']);
  assert.strictEqual(replyCalled, true);
  assert.ok(replyMsg.includes('Podaj poprawny poziom'));
  console.log('✅ Poprawnie odrzucono niepoprawny poziom "abc".');

  replyCalled = false;
  await lvlset.execute(null, mockMessageSuccess, ['150']);
  assert.strictEqual(replyCalled, true);
  assert.ok(replyMsg.includes('Podaj poprawny poziom'));
  console.log('✅ Poprawnie odrzucono poziom poza zakresem (150).');

  replyCalled = false;
  await lvlset.execute(null, mockMessageSuccess, ['-5']);
  assert.strictEqual(replyCalled, true);
  assert.ok(replyMsg.includes('Podaj poprawny poziom'));
  console.log('✅ Poprawnie odrzucono poziom ujemny (-5).');

  // Teraz przetestujmy poprawny poziom
  replyCalled = false;
  await lvlset.execute(null, mockMessageSuccess, ['42']);
  assert.strictEqual(replyCalled, true);
  assert.ok(replyMsg.includes('Ustawiono Twój poziom na **42**'));
  console.log('✅ Pomyślnie ustawiono poziom na 42 dla twórcy.');

  // Sprawdźmy czy baza danych została zaktualizowana
  const { getUser } = require('../utils/storage');
  const user = getUser('100060812419294');
  assert.strictEqual(user.level, 42);
  assert.strictEqual(user.xp, 0);
  console.log('✅ Zweryfikowano zapis w bazie danych (level: 42, xp: 0).');

  console.log('🎉 Wszystkie testy przeszły pomyślnie!');
}

test().catch(err => {
  console.error('❌ Test nie powiódł się:', err);
  process.exit(1);
});
