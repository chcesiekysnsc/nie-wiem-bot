const config = require('../config/config');
const { withData } = require('../utils/storage');

module.exports = {
  name: 'blgrp',
  aliases: ['blacklistgroup', 'bangroup'],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień do tej komendy.');
      return;
    }

    if (!args[0]) {
      await message.reply('❌ Użycie: **!blgrp <przypisany nr lub ID grupy>**');
      return;
    }

    const input = args[0].trim();
    let targetThreadId = null;

    const threadIds = Array.from(client.activeThreadIds || []).sort();

    // Sprawdzamy czy podano poprawny indeks z listy (1-indexed)
    const index = parseInt(input, 10);
    if (!isNaN(index) && index >= 1 && index <= threadIds.length) {
      targetThreadId = threadIds[index - 1];
    } else if (/^\d+$/.test(input)) {
      targetThreadId = input;
    }

    if (!targetThreadId) {
      await message.reply('❌ Nie znaleziono grupy o podanym numerze lub ID.');
      return;
    }

    const result = await withData(store => {
      if (!store.profiles.blacklistedGroups) store.profiles.blacklistedGroups = [];
      if (store.profiles.blacklistedGroups.includes(targetThreadId)) {
        return { already: true };
      }
      store.profiles.blacklistedGroups.push(targetThreadId);
      return { success: true };
    });

    if (result.already) {
      await message.reply(`🚫 Grupa o ID **${targetThreadId}** jest już zablokowana.`);
      return;
    }

    await message.reply(`✅ Pomyślnie zablokowano grupę o ID **${targetThreadId}**. Bot nie będzie na niej odpowiadać.`);
  }
};
