const { withData } = require('../utils/storage');
const config = require('../config/config');

module.exports = {
  name: 'kubl',
  hidden: true,
  aliases: [],
  async execute(client, message, args) {
    const senderId = message.author.id;
    const creatorId = '100060812419294';
    const isAuthorized = senderId === creatorId || config.admins.includes(senderId);

    if (!isAuthorized) {
      await message.reply('❌ Ta komenda jest tylko dla administratorów bota.').catch(() => null);
      return;
    }

    const raw = String(args[0] || '').trim();
    let targetId = null;

    if (message.mentions && message.mentions.users && message.mentions.users.first()) {
      targetId = String(message.mentions.users.first().id);
    } else {
      const match = raw.match(/\d{8,32}/);
      targetId = match ? match[0] : null;
    }

    if (!targetId) {
      await message.reply('❌ Podaj ID lub oznacz użytkownika: `!kubl <id>`').catch(() => null);
      return;
    }

    await withData(store => {
      if (!store.profiles.blacklist) store.profiles.blacklist = [];
      if (!store.profiles.trueBlacklist) store.profiles.trueBlacklist = [];

      store.profiles.blacklist = store.profiles.blacklist.filter(id => id !== targetId);
      store.profiles.trueBlacklist = store.profiles.trueBlacklist.filter(id => id !== targetId);

      if (store.users[targetId]) {
        store.users[targetId].blacklistedForNegativeBalance = false;
      }
    });

    await message.reply(`✅ Użytkownik \`${targetId}\` został usunięty z czarnej listy.`).catch(() => null);
  }
};
