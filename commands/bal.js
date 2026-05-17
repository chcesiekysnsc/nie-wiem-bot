const { infoEmbed } = require('../utils/embeds');
const { formatCurrency, formatNumber, refreshBadges, ensureInventoryRecord } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'bal',
  aliases: ['balance'],
  async execute(client, message) {
    const target = message.mentions.users.first() || message.author;

    const snapshot = await withData(store => {
      const user = createUser(target.id, store.users);
      refreshBadges(user, ensureInventoryRecord(store.inventory, target.id));

      return {
        balance: user.balance,
        bank: user.bank,
        level: user.level,
        prestige: user.prestige
      };
    });

    const embed = infoEmbed('Stan konta', target.id === message.author.id ? 'Twoje aktualne saldo.' : `Saldo uzytkownika ${target}.`)
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Portfel', value: formatCurrency(snapshot.balance), inline: true },
        { name: 'Bank', value: formatCurrency(snapshot.bank), inline: true },
        { name: 'Net worth', value: formatCurrency(snapshot.balance + snapshot.bank), inline: true },
        { name: 'Level', value: formatNumber(snapshot.level), inline: true },
        { name: 'Prestige', value: formatNumber(snapshot.prestige), inline: true }
      );

    await message.reply({ embeds: [embed] });
  }
};
