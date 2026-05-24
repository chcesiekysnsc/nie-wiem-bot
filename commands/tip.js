const { formatCurrency } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'tip',
  aliases: ['przelej', 'daj'],
  async execute(client, message, args) {
    const rawAmount = args[0];
    let targetId = null;
    let targetName = 'Uzytkownik';

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
      await message.reply('❌ Użyj: `!tip <kwota> @osoba` lub `!tip <kwota> <id>`');
      return;
    }

    if (targetId === message.author.id) {
      await message.reply('❌ Nie możesz przelać pieniędzy samemu sobie.');
      return;
    }

    const result = await withData(store => {
      if (store.profiles.blacklist && store.profiles.blacklist.includes(targetId)) {
        return { error: '❌ Ten użytkownik jest zablokowany i nie możesz wchodzić z nim w interakcje.' };
      }

      const sender = createUser(message.author.id, store.users);
      const receiver = createUser(targetId, store.users);

      const isAll = ['all', 'max'].includes(String(rawAmount || '').toLowerCase());
      let amount = isAll ? sender.balance : Math.floor(Number(rawAmount));

      if (isNaN(amount) || amount <= 0) {
        return { error: '❌ Podaj poprawną kwotę do przelania.' };
      }

      let lockedAmount = 0;
      if (sender.activeLoan && Date.now() - sender.activeLoan.takenAt < 48 * 60 * 60 * 1000) {
        lockedAmount = sender.activeLoan.originalAmount;
      }

      if (sender.balance - lockedAmount < amount) {
        return { error: `❌ Te środki są zablokowane z tytułu pożyczki (blokada 48h). Wolne środki do przelania: ${formatCurrency(Math.max(0, sender.balance - lockedAmount))}` };
      }

      const tax = Math.floor(amount * 0.05);
      const transferAmount = amount - tax;

      sender.balance -= amount;
      receiver.balance += transferAmount;

      return { success: true, amount: transferAmount, tax, senderBalance: sender.balance };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    await message.reply(`💸 Przelano **${formatCurrency(result.amount)}** do **${targetName}**. (Podatek: **${formatCurrency(result.tax)}**)`);
  }
};
