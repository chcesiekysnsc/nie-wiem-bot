const config = require('../config/config');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const {
  ensureInventoryRecord,
  formatCurrency,
  hasItem,
  recordGame,
  refreshBadges,
  resolveAmount
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const BASE_POOL = ['🍒', '🍒', '🍋', '🍋', '🍉', '⭐', '💎', '7️⃣'];
const LUCKY_POOL = [...BASE_POOL, '🍀', '🍀', '💎', '7️⃣'];

function pullSymbol(lucky) {
  const pool = lucky ? LUCKY_POOL : BASE_POOL;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getMultiplier(symbols, lucky) {
  const [first, second, third] = symbols;
  const unique = new Set(symbols);

  if (unique.size === 1) {
    if (first === '7️⃣') return 5;
    if (first === '💎') return 4;
    return 3;
  }

  if (first === second || second === third || first === third) {
    return lucky ? 1.6 : 1.4;
  }

  if (lucky && symbols.includes('🍀')) {
    return 1.2;
  }

  return 0;
}

module.exports = {
  name: 'slots',
  aliases: ['slot'],
  async execute(client, message, args) {
    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const bet = resolveAmount(args[0], user.balance);

      if (!bet) {
        return { error: 'Uzyj: `!slots <bet>`.' };
      }

      if (bet > user.balance) {
        return { error: 'Nie masz tylu coinsow w portfelu.' };
      }

      if (bet > config.economy.maxBet) {
        return { error: `Max bet dla tej gry to ${formatCurrency(config.economy.maxBet)}.` };
      }

      const lucky = hasItem(inventory, 'luckycharm');
      user.balance -= bet;

      const symbols = [pullSymbol(lucky), pullSymbol(lucky), pullSymbol(lucky)];
      const multiplier = getMultiplier(symbols, lucky);
      const payout = Math.floor(bet * multiplier);
      user.balance += payout;

      const net = payout - bet;
      const leveledUp = recordGame(user, net);
      refreshBadges(user, inventory);

      return {
        symbols,
        bet,
        payout,
        net,
        leveledUp
      };
    });

    if (result.error) {
      await message.reply({ embeds: [errorEmbed('Slots', result.error)] });
      return;
    }

    const won = result.net >= 0;
    const embed = (won ? successEmbed : errorEmbed)(
      'Slots',
      `${result.symbols.join(' | ')}`
    ).addFields(
      { name: 'Bet', value: formatCurrency(result.bet), inline: true },
      { name: 'Wyplata', value: formatCurrency(result.payout), inline: true },
      { name: 'Bilans rundy', value: `${result.net >= 0 ? '+' : '-'}${formatCurrency(Math.abs(result.net))}`, inline: true }
    );

    if (result.leveledUp) {
      embed.addFields({ name: 'Level up', value: 'Sloty wbily ci kolejny level.', inline: false });
    }

    await message.reply({ embeds: [embed] });
  }
};
