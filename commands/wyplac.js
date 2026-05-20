const {
  ensureInventoryRecord,
  formatCurrency,
  refreshBadges,
  resolveAmount
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'wyplac',
  aliases: ['withdraw', 'with'],
  async execute(client, message, args) {
    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const amount = resolveAmount(args[0], user.bank);

      if (!amount) {
        return { error: '❌ Podaj poprawną kwotę lub `all`.' };
      }

      if (amount > user.bank) {
        return { error: '❌ Nie masz tylu coinsów w banku.' };
      }

      user.bank -= amount;
      user.balance += amount;
      refreshBadges(user, inventory);

      return {
        amount,
        bank: user.bank
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    await message.reply(`🏦 Wypłacono **${formatCurrency(result.amount)}** z banku. (Pozostało: ${formatCurrency(result.bank)})`);
  }
};
