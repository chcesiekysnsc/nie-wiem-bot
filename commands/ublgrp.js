const config = require('../config/config');
const { withData } = require('../utils/storage');

module.exports = {
  name: 'ublgrp',
  aliases: ['unblacklistgroup', 'unbangroup'],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień do tej komendy.');
      return;
    }

    if (!args[0]) {
      await message.reply('❌ Użycie: `!ublgrp <przypisany nr lub ID grupy>`');
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
      const idx = store.profiles.blacklistedGroups.indexOf(targetThreadId);
      if (idx === -1) {
        return { notFound: true };
      }
      store.profiles.blacklistedGroups.splice(idx, 1);
      return { success: true };
    });

    if (result.notFound) {
      await message.reply(`👤 Grupa o ID \`${targetThreadId}\` nie znajduje się na czarnej liście.`);
      return;
    }

    await message.reply(`✅ Pomyślnie odblokowano grupę o ID \`${targetThreadId}\`. Bot ponownie będzie na niej odpowiadać.`);
  }
};
