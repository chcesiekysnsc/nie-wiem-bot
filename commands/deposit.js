const { errorEmbed, successEmbed } = require('../utils/embeds');
const {
  addXp,
  ensureInventoryRecord,
  formatCurrency,
  getBankCapacity,
  refreshBadges,
  resolveAmount
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'deposit',
  aliases: ['dep'],
  async execute(client, message, args) {
    const rawAmount = args[0];

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const bankCapacity = getBankCapacity(user, inventory);
      const freeSpace = Math.max(0, bankCapacity - user.bank);

      if (freeSpace <= 0) {
        return { error: 'Twoj bank jest juz pelny.' };
      }

      let amount = resolveAmount(rawAmount, user.balance);
      if (!amount) {
        return { error: 'Podaj poprawna kwote lub `all`.' };
      }

      const isAll = ['all', 'max'].includes(String(rawAmount || '').toLowerCase());
      const maxDeposit = Math.min(user.balance, freeSpace);

      if (amount > maxDeposit) {
        if (isAll) {
          amount = maxDeposit;
        } else {
          return { error: `Mozesz wplacic maksymalnie ${formatCurrency(maxDeposit)}.` };
        }
      }

      user.balance -= amount;
      user.bank += amount;
      addXp(user, 8);
      refreshBadges(user, inventory);

      return {
        amount,
        bank: user.bank,
        bankCapacity
      };
    });

    if (result.error) {
      await message.reply({ embeds: [errorEmbed('Deposit', result.error)] });
      return;
    }

    const embed = successEmbed('Wplata do banku', `Przeniosles ${formatCurrency(result.amount)} do banku.`)
      .addFields(
        { name: 'Bank', value: formatCurrency(result.bank), inline: true },
        { name: 'Limit banku', value: formatCurrency(result.bankCapacity), inline: true }
      );

    await message.reply({ embeds: [embed] });
  }
};
