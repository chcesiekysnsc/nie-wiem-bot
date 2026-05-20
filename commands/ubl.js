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
