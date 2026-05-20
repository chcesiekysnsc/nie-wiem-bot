const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'del',
  aliases: ['removemoney', 'admdec'],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień do tej komendy.');
      return;
    }

    const amount = Math.floor(Number(args[0]));
    if (isNaN(amount) || amount <= 0) {
      await message.reply('❌ Użyj: `!del <kwota> @osoba` lub `!del <kwota> <id>`');
      return;
    }

    let targetId = null;
    let targetName = 'Cel';

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
    } else if (args[1] && /^\d+$/.test(args[1])) {
      targetId = args[1];
      targetName = `Uzytkownik_${targetId.slice(-6)}`;
      if (client.userNames.has(targetId)) {
        targetName = client.userNames.get(targetId);
      }
    }

    if (!targetId) {
      await message.reply('❌ Wskaż użytkownika: `!del <kwota> @osoba` lub `!del <kwota> <id>`');
      return;
    }

    const result = await withData(store => {
      const user = createUser(targetId, store.users);
      const inventory = ensureInventoryRecord(store.inventory, targetId);

      user.balance = Math.max(0, user.balance - amount);
      refreshBadges(user, inventory);

      return { balance: user.balance };
    });

    await message.reply(`💸 Admin usunął **${formatCurrency(amount)}** z konta **${targetName}**. Nowy balans użytkownika: **${formatCurrency(result.balance)}**`);
  }
};
