const { withData } = require('../utils/storage');
const { checkCooldown, checkSpam } = require('../utils/cooldowns');

const testUserId = 'cooldown_spam_user';

async function resetTestState() {
  await withData(store => {
    delete store.cooldowns.commands[testUserId];
    delete store.cooldowns.cooldownNotifications[testUserId];

    if (Array.isArray(store.profiles.blacklist)) {
      store.profiles.blacklist = store.profiles.blacklist.filter(id => id !== testUserId);
    }

    if (Array.isArray(store.profiles.trueBlacklist)) {
      store.profiles.trueBlacklist = store.profiles.trueBlacklist.filter(id => id !== testUserId);
    }
  });
}

async function run() {
  console.log('=== TESTING GLOBAL COOLDOWN BLACKLIST ===\n');

  await resetTestState();

  let state = await checkCooldown('bal', testUserId);
  if (state.active) {
    throw new Error('Pierwsze użycie !bal nie powinno być na cooldownie.');
  }

  for (let i = 1; i <= 2; i += 1) {
    state = await checkCooldown('bal', testUserId);
    if (!state.active || state.blacklisted) {
      throw new Error(`Próba !bal #${i} powinna zwrócić zwykły cooldown bez blacklisty.`);
    }
  }

  state = await checkCooldown('help', testUserId);
  if (state.active) {
    throw new Error('Pierwsze użycie !help nie powinno być na cooldownie.');
  }

  for (let i = 1; i <= 3; i += 1) {
    state = await checkCooldown('help', testUserId);

    if (!state.active) {
      throw new Error(`Próba !help #${i} powinna zwrócić cooldown.`);
    }

    if (i < 3 && state.blacklisted) {
      throw new Error('Blacklista została nadana zbyt wcześnie.');
    }
  }

  let isBlacklisted = false;
  let cooldownNotificationEntry = null;
  await withData(store => {
    isBlacklisted = Array.isArray(store.profiles.blacklist) && store.profiles.blacklist.includes(testUserId);
    cooldownNotificationEntry = store.cooldowns.cooldownNotifications[testUserId] || null;
  });

  console.log('Ostatnia odpowiedź cooldownu:', state);
  console.log('Czy użytkownik trafił na blacklistę:', isBlacklisted);
  console.log('Pozostały wpis cooldownNotifications:', cooldownNotificationEntry);

  if (state.blacklisted && isBlacklisted && cooldownNotificationEntry === null) {
    console.log('✅ PASS: 5 powiadomień o cooldownie w 30s zlicza się globalnie i dodaje użytkownika do czarnej listy.');
  } else {
    throw new Error('System blacklisty za globalny spam cooldownami nie zadziałał poprawnie.');
  }

  await resetTestState();

  const flowCommands = ['bal', 'help', 'bal', 'help', 'bal', 'help', 'bal'];
  for (const commandName of flowCommands) {
    const cooldownState = await checkCooldown(commandName, testUserId);
    if (cooldownState.active) {
      state = cooldownState;
      continue;
    }

    const spamState = await checkSpam(testUserId);
    if (spamState.blocked) {
      throw new Error('Antyspam zablokował użytkownika zanim uzbierało się 5 globalnych ostrzeżeń cooldownu.');
    }
  }

  await withData(store => {
    isBlacklisted = Array.isArray(store.profiles.blacklist) && store.profiles.blacklist.includes(testUserId);
  });

  console.log('\nOstatnia odpowiedź w przepływie mieszanych komend:', state);
  console.log('Czy użytkownik trafił na blacklistę po mieszanym spamie:', isBlacklisted);

  if (state.blacklisted && isBlacklisted) {
    console.log('✅ PASS: Mieszany spam różnymi komendami też kończy się blacklistą po 5 ostrzeżeniach cooldownu.');
  } else {
    throw new Error('Mieszany spam różnymi komendami nie zakończył się blacklistą.');
  }

  await resetTestState();
  console.log('\n=== TEST COMPLETED ===');
}

run().catch(async error => {
  console.error('❌ FAIL:', error.message);
  await resetTestState().catch(() => null);
  process.exitCode = 1;
});
