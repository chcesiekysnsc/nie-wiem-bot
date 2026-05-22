const config = require('../config/config');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'ubl',
  aliases: ['ybl', 'unbl', 'unblacklist'],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień do tej komendy.');
      return;
    }

    if (!args[0]) {
      await message.reply('❌ Podaj ID/oznacz osobę lub podaj numer/ID grupy: `!ubl @osoba`, `!ubl <id_uzytkownika>` lub `!ubl <nr_grupy>`');
      return;
    }

    const input = args[0].trim();
    const threadIds = Array.from(client.activeThreadIds || []).sort();

    // Sprawdzamy czy podano poprawny indeks grupy z listy
    const index = parseInt(input, 10);
    let targetGroupId = null;
    if (!isNaN(index) && index >= 1 && index <= threadIds.length) {
      targetGroupId = threadIds[index - 1];
    } else {
      // Sprawdzamy czy podane ID jest obecnie na liście zablokowanych grup
      const isGroupBanned = await withData(store => {
        return (store.profiles.blacklistedGroups || []).includes(input);
      });
      if (isGroupBanned) {
        targetGroupId = input;
      }
    }

    if (targetGroupId) {
      const result = await withData(store => {
        if (!store.profiles.blacklistedGroups) store.profiles.blacklistedGroups = [];
        const idx = store.profiles.blacklistedGroups.indexOf(targetGroupId);
        if (idx === -1) {
          return { notFound: true };
        }
        store.profiles.blacklistedGroups.splice(idx, 1);
        return { success: true };
      });

      if (result.notFound) {
        await message.reply(`👤 Grupa o ID \`${targetGroupId}\` nie znajduje się na czarnej liście.`);
        return;
      }

      await message.reply(`✅ Pomyślnie odblokowano grupę o ID \`${targetGroupId}\`. Bot ponownie będzie na niej odpowiadać.`);
      return;
    }

    let targetId = null;
    let targetName = 'Użytkownik';

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
    } else if (args[0] && /^\d+$/.test(args[0])) {
      targetId = args[0];
      targetName = `Uzytkownik_${targetId.slice(-6)}`;
      if (client.userNames.has(targetId)) {
        targetName = client.userNames.get(targetId);
      }
    }

    if (!targetId) {
      await message.reply('❌ Podaj ID lub oznacz osobę: `!ubl @osoba` lub `!ubl <id>`');
      return;
    }

    const result = await withData(store => {
      if (!store.profiles.blacklist) store.profiles.blacklist = [];
      const idx = store.profiles.blacklist.indexOf(targetId);
      if (idx === -1) {
        return { notFound: true };
      }
      store.profiles.blacklist.splice(idx, 1);
      return { success: true };
    });

    if (result.notFound) {
      await message.reply(`👤 **${targetName}** nie znajduje się na czarnej liście.`);
      return;
    }

    await message.reply(`✅ Usunięto **${targetName}** z czarnej listy.`);
  }
};
