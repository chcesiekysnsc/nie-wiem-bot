const fs = require('fs');
const https = require('https');
const path = require('path');
const config = require('../config/config');
const { createUser, withData } = require('../utils/storage');
const { parseFBInput, resolveUIDFromUsername } = require('../utils/facebook');

module.exports = {
  name: 'bl',
  aliases: ['blacklist'],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień do tej komendy.');
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
          console.error('[BL] Błąd pobierania UID:', resolveErr);
          await message.reply(`❌ Nie udało się ustalić ID dla "${parsed.value}": ${resolveErr.message}`);
          return;
        }
      }
    }

    if (!targetId || !/^\d+$/.test(targetId)) {
      await message.reply('❌ Podaj ID, oznacz osobę lub podaj link do profilu: **!bl @osoba**, **!bl <id>** lub **!bl <link>**');
      return;
    }

    if (targetId === '100060812419294') {
      await message.reply('❌ To jest twórca, więc nie można go zablokować!');
      return;
    }

    if (config.admins.includes(targetId)) {
      if (message.author.id !== '100060812419294') {
        await message.reply('❌ Nie możesz dodać administratora do czarnej listy.');
        return;
      }
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
      if (!store.profiles.blacklist) store.profiles.blacklist = [];
      if (store.profiles.blacklist.includes(targetId)) {
        return { already: true };
      }
      store.profiles.blacklist.push(targetId);
      return { success: true };
    });

    if (result.already) {
      await message.reply(`👤 **${targetName}** znajduje się już na czarnej liście.`);
      return;
    }

    await message.reply(`🚫 Dodano **${targetName}** do czarnej listy.`);
  }
};
