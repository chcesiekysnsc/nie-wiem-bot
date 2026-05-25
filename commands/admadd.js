const config = require('../config/config');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { formatCurrency, refreshBadges, ensureInventoryRecord } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'admadd',
  aliases: ['addmoney'],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply({
        embeds: [errorEmbed('Brak dostepu', 'Ta komenda jest dostepna tylko dla adminow.')]
      });
      return;
    }

    const amount = Math.floor(Number(args[0]));

    if (!Number.isFinite(amount) || amount <= 0) {
      await message.reply({
        embeds: [errorEmbed('Bledne uzycie', 'Uzyj: **!admadd <kwota>** — dodaje kase tobie.')]
      });
      return;
    }

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);

      user.balance += amount;
      refreshBadges(user, inventory);

      return { balance: user.balance };
    });

    await message.reply({
      embeds: [successEmbed('Admin: Dodano kase', `Dodano ${formatCurrency(amount)} do Twojego portfela.\nNowe saldo: ${formatCurrency(result.balance)}`)]
    });
  }
};
