const config = require('../config/config');
const {
  ensureInventoryRecord,
  formatCurrency,
  hasItem,
  recordGame,
  refreshBadges,
  resolveAmount
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const SYMBOLS = {
  cherry: '🍒',
  lemon: '🍋',
  watermelon: '🍉',
  star: '⭐',
  gem: '💎',
  seven: '7️⃣',
  lucky: '🍀'
};

const BASE_POOL = [
  SYMBOLS.cherry,
  SYMBOLS.cherry,
  SYMBOLS.lemon,
  SYMBOLS.lemon,
  SYMBOLS.watermelon,
  SYMBOLS.star,
  SYMBOLS.gem,
  SYMBOLS.seven
];

const LUCKY_POOL = [...BASE_POOL, SYMBOLS.lucky, SYMBOLS.lucky, SYMBOLS.gem, SYMBOLS.seven];

function pullSymbol(lucky) {
  const pool = lucky ? LUCKY_POOL : BASE_POOL;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getMultiplier(symbols, lucky) {
  const [first, second, third] = symbols;
  const unique = new Set(symbols);

  if (unique.size === 1) {
    if (first === SYMBOLS.seven) return 5;
    if (first === SYMBOLS.gem) return 4;
    return 3;
  }

  if (first === second || second === third || first === third) {
    return lucky ? 1.6 : 1.4;
  }

  if (lucky && symbols.includes(SYMBOLS.lucky)) {
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
        return { error: '❌ Podaj poprawną kwotę betu.' };
      }

      if (bet > user.balance) {
        return { error: '❌ Brak wystarczających środków w portfelu.' };
      }

      user.balance -= bet;

      const symbols = [pullSymbol(false), pullSymbol(false), pullSymbol(false)];
      const multiplier = getMultiplier(symbols, false);
      const payout = Math.floor(bet * multiplier);
      user.balance += payout;

      const net = payout - bet;
      recordGame(user, net);
      refreshBadges(user, inventory);

      return {
        symbols,
        bet,
        payout,
        net,
        balance: user.balance
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const won = result.net >= 0;
    const winText = won ? `Wygrana! **+${formatCurrency(result.net)}**` : `Przegrana. **-${formatCurrency(Math.abs(result.net))}**`;
    await message.reply(`🎰 Slots: ${result.symbols.join(' | ')}. ${winText}. Twój balans: **${formatCurrency(result.balance)}**`);
  }
};
