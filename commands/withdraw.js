const { errorEmbed, successEmbed } = require('../utils/embeds');
const {
  addXp,
  ensureInventoryRecord,
  formatCurrency,
  refreshBadges,
  resolveAmount
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'withdraw',
  aliases: ['with'],
  async execute(client, message, args) {
    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const amount = resolveAmount(args[0], user.bank);

      if (!amount) {
        return { error: 'Podaj poprawna kwote lub `all`.' };
      }

      if (amount > user.bank) {
        return { error: 'Nie masz tylu coinsow w banku.' };
      }

      user.bank -= amount;
      user.balance += amount;
      addXp(user, 8);
      refreshBadges(user, inventory);

      return {
        amount,
        bank: user.bank
      };
    });

    if (result.error) {
      await message.reply({ embeds: [errorEmbed('Withdraw', result.error)] });
      return;
    }

    const embed = successEmbed('Wyplata z banku', `Wyplaciles ${formatCurrency(result.amount)} z banku.`)
      .addFields({ name: 'Pozostalo w banku', value: formatCurrency(result.bank), inline: true });

    await message.reply({ embeds: [embed] });
  }
};
