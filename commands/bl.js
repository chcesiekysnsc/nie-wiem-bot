const config = require('../config/config');
const { createUser, withData } = require('../utils/storage');

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
    } else if (args[0] && /^\d+$/.test(args[0])) {
      targetId = args[0];
      targetName = `Uzytkownik_${targetId.slice(-6)}`;
      if (client.userNames.has(targetId)) {
        targetName = client.userNames.get(targetId);
      }
    }

    if (!targetId) {
      await message.reply('❌ Podaj ID lub oznacz osobę: **!bl @osoba** lub **!bl <id>**');
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
