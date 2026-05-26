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

function getConsecutiveCount(array) {
  if (!array || array.length === 0) return 0;
  const lastElement = array[array.length - 1];
  let count = 0;
  for (let i = array.length - 1; i >= 0; i--) {
    if (array[i] === lastElement) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

module.exports = {
  name: 'coinflip',
  aliases: ['cf'],
  async execute(client, message, args) {
    const choice = normalizeChoice(args[1]);

    if (!choice) {
      await message.reply('❌ Użyj: **!coinflip <kwota> <orzel/reszka>**');
      return;
    }

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const bet = resolveAmount(args[0], user.balance);

      if (!bet) return { error: '❌ Podaj poprawną kwotę betu.' };
      if (bet > user.balance) return { error: '❌ Brak wystarczających środków w portfelu.' };

      user.balance -= bet;

      user.lastFlips = user.lastFlips || [];
      const crypto = require('crypto');
      let rawFlip = 'heads';

      const consecutiveCount = getConsecutiveCount(user.lastFlips);
      if (consecutiveCount === 0) {
        rawFlip = crypto.randomInt(0, 2) === 0 ? 'heads' : 'tails';
      } else {
        const lastSide = user.lastFlips[user.lastFlips.length - 1];
        const oppositeSide = lastSide === 'heads' ? 'tails' : 'heads';

        let oppositeChance = 0.50;
        if (consecutiveCount === 1) oppositeChance = 0.50;
        else if (consecutiveCount === 2) oppositeChance = 0.55;
        else if (consecutiveCount === 3) oppositeChance = 0.65;
        else if (consecutiveCount === 4) oppositeChance = 0.75;
        else if (consecutiveCount === 5) oppositeChance = 0.85;
        else if (consecutiveCount >= 6) oppositeChance = 0.90;

        const roll = crypto.randomInt(0, 100);
        if (roll < oppositeChance * 100) {
          rawFlip = oppositeSide;
        } else {
          rawFlip = lastSide;
        }
      }

      let won = rawFlip === choice;
      let secondChanceSaved = false;
      let badgeUsed = '';

      // Apply badge win chance bonus if they lost the raw flip
      if (!won && user.badges) {
        let saveChance = 0;
        if (user.badges.includes(config.badges.bog)) {
          saveChance = 0.04;
          badgeUsed = config.badges.bog;
        } else if (user.badges.includes(config.badges.rekin)) {
          saveChance = 0.02;
          badgeUsed = config.badges.rekin;
        } else if (user.badges.includes(config.badges.hazardzista)) {
          saveChance = 0.01;
          badgeUsed = config.badges.hazardzista;
        }

        if (saveChance > 0) {
          const saveRoll = crypto.randomInt(0, 10000);
          if (saveRoll < saveChance * 10000) {
            won = true;
            secondChanceSaved = true;
          }
        }
      }

      const flip = won ? choice : (choice === 'heads' ? 'tails' : 'heads');
      user.lastFlips.push(flip);
      if (user.lastFlips.length > 5) {
        user.lastFlips.shift();
      }

      let payout = won ? bet * 2 : 0;
      if (won && user.badges && user.badges.includes(config.badges.uzalezniony)) {
        payout += Math.round(bet * 0.03);
      }
      user.balance += payout;

      const net = payout - bet;
      const xpResult = recordGame(user, net, 25, inventory);
      refreshBadges(user, inventory);

      return { won, bet, payout, net, flip, xpResult, secondChanceSaved, badgeUsed };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const outcome = displayChoice(result.flip);
    const winText = result.won ? `Wygrana! +${formatCurrency(result.net)}` : `Przegrana. -${formatCurrency(result.bet)}`;
    let replyText = `🪙 Coinflip: Wypadło **${outcome}**. ${winText}`;

    if (result.secondChanceSaved && result.badgeUsed) {
      replyText += `\n🍀 Odznaka **${result.badgeUsed}** aktywowała drugą szansę i uratowała Cię przed przegraną!`;
    }

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
