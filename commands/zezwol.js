const config = require('../config/config');
const { withData } = require('../utils/storage');
const { parseFBInput, resolveUIDFromUsername } = require('../utils/facebook');

module.exports = {
  name: 'zezwol',
  aliases: ['allow'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Tylko twórca bota może używać tej komendy.');
      return;
    }

    if (!args[0] || args[0].toLowerCase() !== 'ai') {
      await message.reply('❌ Użycie: !zezwol ai <@osoba/id/link>');
      return;
    }

    let targetId = null;
    let targetName = 'Użytkownik';

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
    } else if (args[1]) {
      const input = args.slice(1).join(' ');
      const parsed = parseFBInput(input);
      if (parsed.type === 'id') {
        targetId = parsed.value;
      } else {
        const loadingMsg = await message.reply(`🔍 Rozpoznano nazwę użytkownika/link "${parsed.value}". Trwa pobieranie ID z Facebooka...`);
        try {
          targetId = await resolveUIDFromUsername(parsed.value);
        } catch (resolveErr) {
          console.error('[ZEZWOL] Błąd pobierania UID:', resolveErr);
          await message.reply(`❌ Nie udało się ustalić ID dla "${parsed.value}": ${resolveErr.message}`);
          return;
        }
      }
    }

    if (!targetId || !/^\d+$/.test(targetId)) {
      await message.reply('❌ Podaj ID, oznacz osobę lub podaj link do profilu: **!zezwol ai @osoba**, **!zezwol ai <id>** lub **!zezwol ai <link>**');
      return;
    }

    // Pobierz ładną nazwę użytkownika jeśli to możliwe
    if (client.userNames.has(targetId)) {
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

    const result = await withData(store => {
      if (!store.profiles.allowedAI) store.profiles.allowedAI = [];
      if (store.profiles.allowedAI.includes(targetId)) {
        return { already: true };
      }
      store.profiles.allowedAI.push(targetId);
      return { success: true };
    });

    if (result.already) {
      await message.reply(`👤 **${targetName}** ma już zezwolenie na używanie komendy !ai.`);
      return;
    }

    await message.reply(`✅ Zezwolono **${targetName}** na używanie komendy !ai.`);
  }
};
