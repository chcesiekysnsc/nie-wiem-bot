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
      let multiplier = getMultiplier(symbols, false);
      if (multiplier <= 0) {
        let helperChance = 0;
        if (user.badges) {
          if (user.badges.includes(config.badges.bog)) helperChance = 0.02;
          else if (user.badges.includes(config.badges.rekin)) helperChance = 0.01;
          else if (user.badges.includes(config.badges.hazardzista)) helperChance = 0.005;
        }
        if (helperChance > 0 && Math.random() < helperChance) {
          symbols[0] = '🍒';
          symbols[1] = '🍒';
          symbols[2] = '🍋';
          multiplier = getMultiplier(symbols, false);
        }
      }

      let payout = Math.floor(bet * multiplier);
      if (payout > bet && user.badges && user.badges.includes(config.badges.uzalezniony)) {
        const profit = payout - bet;
        payout += Math.round(profit * 0.03);
      }
      user.balance += payout;

      const net = payout - bet;
      const xpResult = recordGame(user, net, 25, inventory);
      refreshBadges(user, inventory);

      return {
        symbols,
        bet,
        payout,
        net,
        xpResult,
        balance: user.balance
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const won = result.net >= 0;
    const winText = won ? `Wygrana! **+${formatCurrency(result.net)}**` : `Przegrana. **-${formatCurrency(Math.abs(result.net))}**`;
    let replyText = `🎰 Slots: ${result.symbols.join(' | ')}. ${winText}. Twój balans: **${formatCurrency(result.balance)}**`;

    if (result.xpResult && result.xpResult.leveledUp) {
      replyText += `\n🎉 **AWANS!** Awansowałeś na **poziom ${result.xpResult.newLevel}**!`;
      if (result.xpResult.milestonesGained && result.xpResult.milestonesGained.length > 0) {
        const { getMilestoneRewardDescription } = require('../utils/economy');
        for (const lvl of result.xpResult.milestonesGained) {
          replyText += `\n🎁 Otrzymałeś nagrodę kamienia milowego za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
        }
      }
    }

    await message.reply(replyText);
  }
};
