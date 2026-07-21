const { withData } = require('../utils/storage');
const { msToReadable } = require('../utils/economy');

const COOLDOWN_MS = 3000;

function getAfkEntry(store, userId) {
  store.profiles = store.profiles || {};
  store.profiles.afk = store.profiles.afk || {};
  return store.profiles.afk[userId] || null;
}

function setAfkEntry(store, userId, reason) {
  store.profiles = store.profiles || {};
  store.profiles.afk = store.profiles.afk || {};
  store.profiles.afk[userId] = {
    reason: reason || 'Nie podano powodu.',
    time: Date.now()
  };
}

function removeAfkEntry(store, userId) {
  store.profiles = store.profiles || {};
  store.profiles.afk = store.profiles.afk || {};
  delete store.profiles.afk[userId];
}

module.exports = {
  name: 'afk',
  aliases: [],
  async execute(client, message, args) {
    const userId = message.author.id;
    const now = Date.now();

    if (args.length === 0) {
      const afkData = await withData(store => getAfkEntry(store, userId));

      if (!afkData) {
        await message.reply(
          '❌ Nie masz ustawionego statusu AFK.\n\n' +
          'Użyj:\n' +
          '• `!afk <powód>` — ustaw status AFK\n' +
          '• `!afk off` — wyłącz status AFK\n\n' +
          'Przykłady:\n' +
          '• `!afk lecę spać`\n' +
          '• `!afk praca`\n' +
          '• `!afk off`'
        );
        return;
      }

      const elapsedMs = Date.now() - afkData.time;
      const elapsedStr = msToReadable(elapsedMs);
      await message.reply(
        `💤 Jesteś AFK od **${elapsedStr}**.\n` +
        `Powód: **${afkData.reason}**\n\n` +
        `⚠️ Aby wyłączyć AFK, wpisz **` + '`!afk off`' + `**\n` +
        `Bez tego wiadomości do Ciebie nadal będą oznaczone jako AFK.`
      );
      return;
    }

    if (args[0].toLowerCase() === 'off') {
      const userCooldown = await withData(store => {
        store.cooldowns = store.cooldowns || {};
        store.cooldowns.commands = store.cooldowns.commands || {};
        store.cooldowns.commands[userId] = store.cooldowns.commands[userId] || {};
        const userCd = store.cooldowns.commands[userId];
        const lastUsed = userCd.afk || 0;
        return { lastUsed };
      });

      if (now - userCooldown.lastUsed < COOLDOWN_MS) {
        const remaining = COOLDOWN_MS - (now - userCooldown.lastUsed);
        await message.reply(`⏳ Odczekaj jeszcze **${msToReadable(remaining)}** przed ponownym użyciem !afk.`);
        return;
      }

      const hadAfk = await withData(store => {
        const entry = getAfkEntry(store, userId);
        if (entry) {
          removeAfkEntry(store, userId);
        }
        return !!entry;
      });

      if (hadAfk) {
        await message.reply('✅ Wyłączono status AFK. Jesteś z powrotem!');
      } else {
        await message.reply('ℹ️ Nie masz ustawionego statusu AFK.');
      }

      await withData(store => {
        store.cooldowns.commands = store.cooldowns.commands || {};
        store.cooldowns.commands[userId] = store.cooldowns.commands[userId] || {};
        store.cooldowns.commands[userId].afk = Date.now();
      });
      return;
    }

    const userCooldown = await withData(store => {
      store.cooldowns = store.cooldowns || {};
      store.cooldowns.commands = store.cooldowns.commands || {};
      store.cooldowns.commands[userId] = store.cooldowns.commands[userId] || {};
      const userCd = store.cooldowns.commands[userId];
      const lastUsed = userCd.afk || 0;
      return { lastUsed };
    });

    if (now - userCooldown.lastUsed < COOLDOWN_MS) {
      const remaining = COOLDOWN_MS - (now - userCooldown.lastUsed);
      await message.reply(`⏳ Odczekaj jeszcze **${msToReadable(remaining)}** przed ponownym użyciem !afk.`);
      return;
    }

    const reason = args.join(' ').trim();
    if (reason.length > 200) {
      await message.reply('❌ Powód AFK jest zbyt długi (maks. 200 znaków).');
      return;
    }

    await withData(store => {
      setAfkEntry(store, userId, reason);
      store.cooldowns.commands = store.cooldowns.commands || {};
      store.cooldowns.commands[userId] = store.cooldowns.commands[userId] || {};
      store.cooldowns.commands[userId].afk = Date.now();
    });

    await message.reply(
      `✅ Ustawiono status AFK.\n` +
      `Powód: **${reason}**\n\n` +
      `⚠️ Aby wyłączyć AFK, wpisz **` + '`!afk off`' + `**\n` +
      `Bez tego wiadomości do Ciebie nadal będą oznaczone jako AFK.`
    );
  }
};
