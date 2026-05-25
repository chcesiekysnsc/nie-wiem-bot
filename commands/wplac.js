const {
  ensureInventoryRecord,
  formatCurrency,
  getBankCapacity,
  refreshBadges,
  resolveAmount
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'wplac',
  aliases: ['deposit', 'dep'],
  async execute(client, message, args) {
    const rawAmount = args[0];

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const bankCapacity = getBankCapacity(user, inventory);
      const freeSpace = Math.max(0, bankCapacity - user.bank);

      if (freeSpace <= 0) {
        return { error: '❌ Twój bank jest już pełny.' };
      }

      let amount = resolveAmount(rawAmount, user.balance);
      if (!amount) {
        return { error: '❌ Podaj poprawną kwotę lub **all**.' };
      }

      const isAll = ['all', 'max'].includes(String(rawAmount || '').toLowerCase());
      const maxDeposit = Math.min(user.balance, freeSpace);

      if (amount > maxDeposit) {
        if (isAll) {
          amount = maxDeposit;
        } else {
          return { error: `❌ Możesz wpłacić maksymalnie ${formatCurrency(maxDeposit)}.` };
        }
      }

      user.balance -= amount;
      user.bank += amount;
      refreshBadges(user, inventory);

      return {
        amount,
        bank: user.bank,
        bankCapacity
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    await message.reply(`🏦 Wpłacono **${formatCurrency(result.amount)}** do banku. (Stan banku: ${formatCurrency(result.bank)}/${formatCurrency(result.bankCapacity)})`);
  }
};
