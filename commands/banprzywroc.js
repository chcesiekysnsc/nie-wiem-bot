const { withData } = require('../utils/storage');

module.exports = {
  name: 'banprzywroc',
  aliases: [],
  async execute(client, message, args) {
    const senderId = message.author.id;

    const targetId = args[0]
      ? String(args[0]).replace(/[<@!>]/g, '').trim()
      : senderId;

    const isSelf = targetId === senderId;
    const isCreator = senderId === '100060812419294';
    const { config } = require('../config/config');
    const isAdmin = config.admins.includes(senderId);

    if (!isSelf && !isCreator && !isAdmin) {
      await message.reply('❌ Możesz przywrócić auto-bana tylko dla siebie.');
      return;
    }

    await withData(store => {
      const u = store.users[targetId];
      if (u) {
        u.bypassBalanceBan = false;
      }
    });

    const name = isSelf ? 'sobie' : `użytkownikowi ${targetId}`;
    await message.reply(`✅ Przywróciłeś automatyczny reset salda powyżej 1 mld v dla ${name}.`).catch(() => null);
  }
};
