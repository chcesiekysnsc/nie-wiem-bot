const config = require('../config/config');
const { createUser, withData } = require('../utils/storage');
const { parseFBInput, resolveUIDFromUsername } = require('../utils/facebook');


module.exports = {
  name: 'adm',
  aliases: ['addadmin'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Tylko twórca bota może używać tej komendy.');
      return;
    }

    let targetId = null;
    let targetName = 'Użytkownik';

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
    } else if (args[0]) {
      const input = args.join(' ');
      const parsed = parseFBInput(input);
      if (parsed.type === 'id') {
        targetId = parsed.value;
      } else {
        const loadingMsg = await message.reply(`🔍 Rozpoznano nazwę użytkownika/link "${parsed.value}". Trwa pobieranie ID z Facebooka...`);
        try {
          targetId = await resolveUIDFromUsername(parsed.value);
        } catch (resolveErr) {
          console.error('[ADM] Błąd pobierania UID:', resolveErr);
          await message.reply(`❌ Nie udało się ustalić ID dla "${parsed.value}": ${resolveErr.message}`);
          return;
        }
      }
    }

    if (!targetId || !/^\d+$/.test(targetId)) {
      await message.reply('❌ Podaj ID, oznacz osobę lub podaj link do profilu: **!adm @osoba**, **!adm <id>** lub **!adm <link>**');
      return;
    }

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
      if (!store.profiles.dynamicAdmins) store.profiles.dynamicAdmins = [];
      if (store.profiles.dynamicAdmins.includes(targetId) || config.admins.includes(targetId)) {
        return { already: true };
      }
      store.profiles.dynamicAdmins.push(targetId);
      if (!config.admins.includes(targetId)) {
        config.admins.push(targetId);
      }
      return { success: true };
    });

    if (result.already) {
      await message.reply(`👑 **${targetName}** jest już administratorem.`);
      return;
    }

    await message.reply(`✅ Nadano uprawnienia administratora dla **${targetName}**.`);
  }
};
