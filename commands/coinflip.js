const config = require('../config/config');
const { ensureInventoryRecord, formatCurrency, hasItem, recordGame, refreshBadges, resolveAmount } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

function normalizeChoice(input) {
  const value = String(input || '').toLowerCase();
  if (['heads', 'head', 'h', 'orzel'].includes(value)) return 'heads';
  if (['tails', 'tail', 't', 'reszka'].includes(value)) return 'tails';
  return null;
}

function displayChoice(choice) {
  return choice === 'heads' ? 'Orzeł' : 'Reszka';
}

module.exports = {
  name: 'coinflip',
  aliases: ['cf'],
  async execute(client, message, args) {
    const choice = normalizeChoice(args[1]);

    if (!choice) {
      await message.reply('❌ Użyj: `!coinflip <kwota> <orzel/reszka>`');
      return;
    }

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const bet = resolveAmount(args[0], user.balance);

      if (!bet) return { error: '❌ Podaj poprawną kwotę betu.' };
      if (bet > user.balance) return { error: '❌ Brak wystarczających środków w portfelu.' };

      user.balance -= bet;

      const flip = Math.random() < 0.5 ? 'heads' : 'tails';
      const won = flip === choice;
      const payout = won ? bet * 2 : 0;
      user.balance += payout;

      const net = payout - bet;
      recordGame(user, net);
      refreshBadges(user, inventory);

      return { won, bet, payout, net, flip };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const outcome = displayChoice(result.flip);
    const winText = result.won ? `Wygrana! +${formatCurrency(result.bet)}` : `Przegrana. -${formatCurrency(result.bet)}`;

    await message.reply(`🪙 Coinflip: Wypadło **${outcome}**. ${winText}`);
  }
};
