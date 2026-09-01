const config = require('../config/config');
const { createUser, withData } = require('../utils/storage');
const { parseFBInput, resolveUIDFromUsername } = require('../utils/facebook');

module.exports = {
  name: 'wiezienie',
  aliases: ['jail', 'wiez'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Tylko twórca bota może używać tej komendy.');
      return;
    }

    if (!args[0] || !args[1]) {
      await message.reply('❌ Użycie: **!wiezienie <minuty> <id/oznaczenie>**\nPrzykład: `!wiezienie 30 @osoba` lub `!wiezienie 60 123456789`');
      return;
    }

    const minutes = parseInt(args[0], 10);
    if (isNaN(minutes) || minutes <= 0) {
      await message.reply('❌ Podaj poprawną liczbę minut (liczbę dodatnią).');
      return;
    }

    let targetId = null;
    let targetName = 'Użytkownik';

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
    } else {
      const input = args.slice(1).join(' ');
      const parsed = parseFBInput(input);
      if (parsed.type === 'id') {
        targetId = parsed.value;
      } else {
        const loadingMsg = await message.reply(`🔍 Rozpoznano nazwę użytkownika/link "${parsed.value}". Trwa pobieranie ID z Facebooka...`);
        try {
          targetId = await resolveUIDFromUsername(parsed.value);
        } catch (resolveErr) {
          console.error('[WIEZIENIE] Błąd pobierania UID:', resolveErr);
          await message.reply(`❌ Nie udało się ustalić ID dla "${parsed.value}": ${resolveErr.message}`);
          return;
        }
      }
    }

    if (!targetId || !/^\d+$/.test(targetId)) {
      await message.reply('❌ Podaj ID, oznacz osobę lub podaj link do profilu: **!wiezienie <minuty> @osoba**, **!wiezienie <minuty> <id>** lub **!wiezienie <minuty> <link>**');
      return;
    }

    if (targetId === creatorId) {
      await message.reply('❌ Nie możesz wsadzić do więzienia twórcy bota!');
      return;
    }

    if (client.userNames && client.userNames.has(targetId)) {
      targetName = client.userNames.get(targetId);
    } else {
      try {
        const resolvedName = await client.resolveUserName(client.api, targetId);
        if (resolvedName && !resolvedName.startsWith('Użytkownik_')) {
          targetName = resolvedName;
        } else {
          targetName = `Uzytkownik_${targetId.slice(-6)}`;
        }
      } catch (_) {
        targetName = `Uzytkownik_${targetId.slice(-6)}`;
      }
    }

    const jailUntil = Date.now() + minutes * 60 * 1000;

    const result = await withData(store => {
      const user = createUser(targetId, store.users);
      user.jailUntil = jailUntil;
      return { success: true };
    });

    if (result.success) {
      await message.reply(`🔒 **${targetName}** trafił do więzienia na **${minutes} min**.\n⏰ Wyjście: **${new Date(jailUntil).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}**`);
    }
  }
};
