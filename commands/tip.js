const { formatCurrency } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

async function resolveName(client, userId) {
  if (typeof client.resolveUserName === 'function') {
    return await client.resolveUserName(userId);
  }
  return (client.userNames && client.userNames.get(userId)) || `Użytkownik_${userId.slice(-6)}`;
}

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
      targetName = mentioned.username || await resolveName(client, targetId);
    } else if (args[1] && /^\d+$/.test(args[1])) {
      targetId = args[1];
      targetName = await resolveName(client, targetId);
    }

    if (!targetId) {
      await message.reply('❌ Użyj: **!tip <kwota> @osoba** lub **!tip <kwota> <id>**');
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

      if (receiver.isMultiAccount) {
        return { error: '❌ Nie możesz przelać pieniędzy na to konto, ponieważ jest ono zablokowane.' };
      }

      const isAll = ['all', 'max'].includes(String(rawAmount || '').toLowerCase());
      let amount = isAll ? sender.balance : Math.floor(Number(rawAmount));

      if (isNaN(amount) || amount <= 0) {
        return { error: '❌ Podaj poprawną kwotę do przelania.' };
      }

      let lockedAmount = 0;
      if (sender.activeLoan) {
        lockedAmount = sender.activeLoan.originalAmount;
      }

      // Zablokowane środki z pożyczki
      if (lockedAmount > 0 && sender.balance - lockedAmount < amount) {
        return { error: `❌ Te środki są zablokowane z tytułu pożyczki. Wolne środki do przelania: ${formatCurrency(Math.max(0, sender.balance - lockedAmount))}` };
      }

      // Zwykły brak środków (bez pożyczki)
      if (sender.balance < amount) {
        return { error: `❌ Nie masz wystarczających środków. Posiadasz: ${formatCurrency(sender.balance)}` };
      }

      const tax = Math.floor(amount * 0.05);
      const transferAmount = amount - tax;

      sender.balance -= amount;
      receiver.balance += transferAmount;

      sender.tipsSent = sender.tipsSent || {};
      sender.tipsSent[targetId] = (sender.tipsSent[targetId] || 0) + 1;

      return { success: true, amount: transferAmount, tax, senderBalance: sender.balance };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    await message.reply(`💸 Przelano **${formatCurrency(result.amount)}** do **${targetName}**. (Podatek: **${formatCurrency(result.tax)}**)`);
  }
};
