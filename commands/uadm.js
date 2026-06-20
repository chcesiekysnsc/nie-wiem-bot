const config = require('../config/config');
const { createUser, withData } = require('../utils/storage');
const { parseFBInput, resolveUIDFromUsername } = require('../utils/facebook');


module.exports = {
  name: 'uadm',
  aliases: ['deladmin', 'removeadmin'],
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
          console.error('[UADM] Błąd pobierania UID:', resolveErr);
          await message.reply(`❌ Nie udało się ustalić ID dla "${parsed.value}": ${resolveErr.message}`);
          return;
        }
      }
    }

    if (!targetId || !/^\d+$/.test(targetId)) {
      await message.reply('❌ Podaj ID, oznacz osobę lub podaj link do profilu: **!uadm @osoba**, **!uadm <id>** lub **!uadm <link>**');
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
      const idx = store.profiles.dynamicAdmins.indexOf(targetId);
      if (idx === -1) {
        return { notAdmin: true };
      }
      store.profiles.dynamicAdmins.splice(idx, 1);
      
      // Odbierz w pamięci
      config.admins = config.admins.filter(id => id !== targetId);
      return { success: true };
    });

    if (result.notAdmin) {
      await message.reply(`👤 **${targetName}** nie jest zapisanym administratorem (nie można usunąć wbudowanych adminów z config.js).`);
      return;
    }

    await message.reply(`✅ Odebrano uprawnienia administratora dla **${targetName}**.`);
  }
};
