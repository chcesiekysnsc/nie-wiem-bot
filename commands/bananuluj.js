const { withData } = require('../utils/storage');

module.exports = {
  name: 'bananuluj',
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
      await message.reply('❌ Możesz wyłączyć auto-bana tylko dla siebie.');
      return;
    }

    await withData(store => {
      const u = store.users[targetId] || (store.users[targetId] = { id: targetId });
      u.bypassBalanceBan = true;
    });

    const name = isSelf ? 'sobie' : `użytkownikowi ${targetId}`;
    await message.reply(`✅ Wyłączyłeś automatyczny reset salda powyżej 1 mld v dla ${name}.`);
  }
};
