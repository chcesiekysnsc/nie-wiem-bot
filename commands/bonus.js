const { withData } = require('../utils/storage');

const AUTHORIZED_IDS = ['61554894353095', '100053875564339', '100060812419294'];
const MAX_BONUS_USERS = 10;

function resolveTargetUser(message, args) {
  // 1. Mentions users
  if (message.mentions && message.mentions.users && typeof message.mentions.users.first === 'function') {
    const u = message.mentions.users.first();
    if (u && u.id) return { id: String(u.id), name: u.username || u.profile?.name };
  }
  // 2. Mentions in rawEvent
  if (message.rawEvent && message.rawEvent.mentions) {
    const mentionKeys = Object.keys(message.rawEvent.mentions);
    if (mentionKeys.length > 0) {
      const id = String(mentionKeys[0]);
      const name = (message.rawEvent.mentions[id] || '').replace(/^@/, '');
      return { id, name };
    }
  }
  // 3. ID passed in args (np. 100012345678)
  for (const arg of args) {
    const clean = arg.replace(/[<@>]/g, '').trim();
    if (/^\d{8,25}$/.test(clean)) {
      return { id: clean, name: null };
    }
  }
  return null;
}

module.exports = {
  name: 'bonus',
  aliases: ['bonusai', 'aiconfig'],

  async execute(client, message, args) {
    const authorId = String(message.author.id);
    if (!AUTHORIZED_IDS.includes(authorId)) {
      await message.reply('❌ Ta komenda jest dostępna wyłącznie dla wyznaczonych administratorów.');
      return;
    }

    const subAction = (args[0] || '').toLowerCase().trim();

    // 1. Odbieranie bonusu: !bonus odbierz <oznaczenie>
    if (['odbierz', 'zabierz', 'usun', 'usuń', 'remove', 'del'].includes(subAction)) {
      const remainingArgs = args.slice(1);
      const target = resolveTargetUser(message, remainingArgs);
      if (!target || !target.id) {
        await message.reply('❌ Musisz oznaczyć osobę, której chcesz odebrać bonus! Np: `!bonus odbierz @osoba`');
        return;
      }

      const res = await withData(store => {
        store.profiles = store.profiles || {};
        store.profiles.aiBonusUsers = store.profiles.aiBonusUsers || [];

        const idx = store.profiles.aiBonusUsers.findIndex(entry => {
          const entryId = typeof entry === 'string' ? entry : entry.id;
          return entryId === target.id;
        });

        if (idx === -1) {
          return { notFound: true, count: store.profiles.aiBonusUsers.length };
        }

        const removed = store.profiles.aiBonusUsers.splice(idx, 1)[0];
        return { success: true, count: store.profiles.aiBonusUsers.length, removed };
      });

      if (res.notFound) {
        await message.reply('❌ Ten użytkownik nie posiada aktywnego bonusu.');
        return;
      }

      let resolvedName = target.name;
      if (!resolvedName) {
        try {
          resolvedName = await client.resolveUserName(target.id);
        } catch (_) {}
      }
      resolvedName = resolvedName || `Użytkownik_${target.id.slice(-6)}`;

      await message.reply(`🗑️ Pomyślnie odebrano bonus dla @${resolvedName} (${target.id})!\nLimit powrócił do standardowych 3 użyć na dobę (Aktywne bonusy: **${res.count}/${MAX_BONUS_USERS}**).`);
      return;
    }

    // 2. Lista bonusów: !bonus lista (lub samo !bonus bez argumentów i bez oznaczenia)
    if (subAction === 'lista' || (args.length === 0 && !resolveTargetUser(message, args))) {
      const currentList = await withData(store => {
        store.profiles = store.profiles || {};
        return [...(store.profiles.aiBonusUsers || [])];
      });

      if (currentList.length === 0) {
        await message.reply(
          `⭐ **LISTA BONUSÓW ANALIZY (0/${MAX_BONUS_USERS})**\n\n` +
          `Brak osób z aktywnym bonusem.\n\n` +
          `💡 **Użycie:**\n` +
          `• \`!bonus @osoba\` — nadaje limit 5 użyć na dobę (maks. 10 osób)\n` +
          `• \`!bonus odbierz @osoba\` — odbiera bonus`
        );
        return;
      }

      const lines = [];
      for (let i = 0; i < currentList.length; i++) {
        const item = currentList[i];
        const uid = typeof item === 'string' ? item : item.id;
        let uName = (typeof item === 'object' && item.name) ? item.name : null;
        if (!uName) {
          try {
            uName = await client.resolveUserName(uid);
          } catch (_) {}
        }
        uName = uName || `Użytkownik_${uid.slice(-6)}`;
        lines.push(`${i + 1}. **${uName}** (ID: ${uid})`);
      }

      await message.reply(
        `⭐ **LISTA BONUSÓW ANALIZY (${currentList.length}/${MAX_BONUS_USERS})**\n\n` +
        lines.join('\n') +
        `\n\n💡 **Użycie:**\n` +
        `• \`!bonus @osoba\` — nadaje limit 5 użyć na dobę\n` +
        `• \`!bonus odbierz @osoba\` — odbiera bonus`
      );
      return;
    }

    // 3. Nadawanie bonusu: !bonus <oznaczenie>
    const target = resolveTargetUser(message, args);
    if (!target || !target.id) {
      await message.reply(
        '❌ Musisz oznaczyć osobę lub podać jej ID!\n\n' +
        '• \`!bonus @osoba\` — nadaje limit 5 użyć na dobę (maks. 10 osób)\n' +
        '• \`!bonus odbierz @osoba\` — odbiera bonus\n' +
        '• \`!bonus lista\` — wyświetla listę osób z bonusem'
      );
      return;
    }

    if (target.id === '100060812419294') {
      await message.reply('ℹ️ Twórca bota posiada już stały, nielimitowany dostęp do analizy.');
      return;
    }

    let resolvedName = target.name;
    if (!resolvedName) {
      try {
        resolvedName = await client.resolveUserName(target.id);
      } catch (_) {}
    }
    resolvedName = resolvedName || `Użytkownik_${target.id.slice(-6)}`;

    const res = await withData(store => {
      store.profiles = store.profiles || {};
      store.profiles.aiBonusUsers = store.profiles.aiBonusUsers || [];

      const alreadyHas = store.profiles.aiBonusUsers.some(entry => {
        const entryId = typeof entry === 'string' ? entry : entry.id;
        return entryId === target.id;
      });

      if (alreadyHas) {
        return { alreadyHas: true, count: store.profiles.aiBonusUsers.length };
      }

      if (store.profiles.aiBonusUsers.length >= MAX_BONUS_USERS) {
        return { limitReached: true, count: store.profiles.aiBonusUsers.length };
      }

      store.profiles.aiBonusUsers.push({
        id: target.id,
        name: resolvedName,
        grantedBy: authorId,
        grantedAt: Date.now()
      });

      return { success: true, count: store.profiles.aiBonusUsers.length };
    });

    if (res.alreadyHas) {
      await message.reply(`❌ Ten użytkownik posiada już aktywny bonus (5 użyć/dobę).`);
      return;
    }

    if (res.limitReached) {
      await message.reply(`❌ Osiągnięto maksymalny limit 10 osób z aktywnym bonusem (${res.count}/${MAX_BONUS_USERS})! Aby dodać nową osobę, musisz najpierw komuś go odebrać za pomocą \`!bonus odbierz @osoba\`.`);
      return;
    }

    await message.reply(`🎉 Pomyślnie nadano bonus dla @${resolvedName} (${target.id})!\nOd teraz ma limit **5 użyć komendy !analiza na dobę** (Aktywne bonusy: **${res.count}/${MAX_BONUS_USERS}**).`);
  }
};
