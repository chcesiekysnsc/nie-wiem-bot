async function execute(client, message, args) {
  const creatorId = '100060812419294';
  if (message.author.id !== creatorId) {
    await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
    return;
  }

  if (args.length < 4) {
    await message.reply('❌ Użycie: !superboss <wygrana> <obrona> <nazwa> <minuty>');
    return;
  }

  const reward = parseInt(args[0]);
  const defense = parseInt(args[1]);
  const bossName = args.slice(2, -1).join(' ');
  const durationMinutes = parseInt(args[args.length - 1]);

  if (isNaN(reward) || isNaN(defense) || isNaN(durationMinutes)) {
    await message.reply('❌ Wszystkie wartości liczbowe muszą być poprawne.');
    return;
  }

  if (reward <= 0 || defense <= 0 || durationMinutes <= 0) {
    await message.reply('❌ Wszystkie wartości muszą być dodatnie.');
    return;
  }

  const bossId = Date.now().toString();
  const endTime = Date.now() + durationMinutes * 60 * 1000;

  // Zapisz superbossa w bazie danych
  await withData(store => {
    if (!store.superbosses) store.superbosses = {};
    store.superbosses[bossId] = {
      id: bossId,
      name: bossName,
      reward: reward,
      defense: defense,
      endTime: endTime,
      participants: {},
      totalStrength: 0,
      status: 'active',
      announcedGroups: []
    };
  });

  // Pobierz listę aktywnych grup (używając tej samej logiki co progresywne podatki)
  const { loadData } = require('../utils/storage');
  const groupStats = loadData('groupStats') || {};
  const now = Date.now();
  const twelveHours = 12 * 60 * 60 * 1000;

  const activeGroups = Object.entries(groupStats)
    .filter(([tId, stats]) => {
      return stats && stats.lastUpdated && (now - stats.lastUpdated) <= twelveHours && (stats.commandsExecuted || 0) >= 2;
    })
    .map(([tId]) => tId);

  // Wyślij powiadomienie na wszystkie aktywna grupy
  const announcementMessage = 
    `⚔️ **${bossName} POJAWIŁ SIĘ!** ⚔️\n\n` +
    `👹 **Nazwa:** ${bossName}\n` +
    `🛡️ **Obrona:** ${defense}\n` +
    `💰 **Nagroda dla każdego:** ${reward}\n` +
    `⏰ **Czas do końca:** ${durationMinutes} minut\n\n` +
    `🔥 Aby dołączyć do walki, napisz: **!walka dolacz**\n` +
    `💪 Twoja siła zostanie losowo przypisana!`;

  let announcedCount = 0;
  for (const groupId of activeGroups) {
    try {
      await client.api.sendMessage(announcementMessage, groupId);
      announcedCount++;
      
      await withData(store => {
        if (store.superbosses[bossId]) {
          store.superbosses[bossId].announcedGroups.push(groupId);
        }
      });
      
      // Mała przerwa między wiadomościami
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`[SUPERBOSS] Błąd wysyłania powiadomienia do grupy ${groupId}:`, err.message);
    }
  }

  // Ustaw timer na zakończenie superbossa
  setTimeout(async () => {
    await handleSuperbossEnd(client, bossId);
  }, durationMinutes * 60 * 1000);

  await message.reply(
    `✅ Super boss **${bossName}** został utworzony!\n` +
    `💰 Nagroda: ${reward}\n` +
    `🛡️ Obrona: ${defense}\n` +
    `⏰ Czas: ${durationMinutes} minut\n` +
    `📢 Powiadomiono ${announcedCount} grup.`
  );
}

module.exports = {
  name: 'superboss',
  aliases: [],
  execute,
  handleSuperbossEnd
};

async function handleSuperbossEnd(client, bossId) {
  const result = await withData(store => {
    if (!store.superbosses || !store.superbosses[bossId]) {
      return { success: false, message: 'Boss nie istnieje' };
    }

    const boss = store.superbosses[bossId];
    if (boss.status !== 'active') {
      return { success: false, message: 'Boss już zakończony' };
    }

    boss.status = 'ended';
    const participantsCount = Object.keys(boss.participants).length;
    const totalStrength = boss.totalStrength;
    const defense = boss.defense;
    const reward = boss.reward;

    // Oblicz szansę na wygraną graczy (jak w gangach)
    const totalPower = totalStrength + defense;
    const playerWinChance = totalStrength / totalPower; // 0-1
    const won = Math.random() < playerWinChance;

    // Rozdaj nagrody jeśli wygrano
    if (won) {
      Object.keys(boss.participants).forEach(userId => {
        if (!store.users[userId]) store.users[userId] = {};
        store.users[userId].balance = (store.users[userId].balance || 0) + reward;
      });
    }

    return {
      success: true,
      boss: boss,
      participantsCount,
      totalStrength,
      defense,
      reward,
      won
    };
  });

  if (!result.success) {
    console.error('[SUPERBOSS]', result.message);
    return;
  }

  const { boss, participantsCount, totalStrength, defense, reward, won } = result;

  const resultMessage = 
    `🏆 **WALKA Z SUPER BOSSIEM ZAKOŃCZONA!** 🏆\n\n` +
    `👹 **Boss:** ${boss.name}\n` +
    `🛡️ **Obrona bossa:** ${defense}\n` +
    `⚔️ **Siła graczy:** ${totalStrength}\n` +
    `👥 **Liczba uczestników:** ${participantsCount}\n\n` +
    (won 
      ? `✅ **GRACZE WYGRALI!**\n💰 Każdy uczestnik otrzymuje **${reward}**!`
      : `❌ **GRACZE PRZEGRALI!**\n😢 Siła graczy była niewystarczająca.`
    );

  // Wyślij wynik na wszystkie grupy gdzie był ogłoszony
  for (const groupId of boss.announcedGroups) {
    try {
      await client.api.sendMessage(resultMessage, groupId);
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`[SUPERBOSS] Błąd wysyłania wyniku do grupy ${groupId}:`, err.message);
    }
  }
}

function withData(callback) {
  const { withData } = require('../utils/storage');
  return withData(callback);
}
