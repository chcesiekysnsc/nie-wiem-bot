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

      const crypto = require('crypto');
      let baseChance = 0.45;
      let badgeUsed = '';

      if (user.badges) {
        if (user.badges.includes(config.badges.bog)) {
          baseChance += 0.04;
          badgeUsed = config.badges.bog;
        } else if (user.badges.includes(config.badges.rekin)) {
          baseChance += 0.02;
          badgeUsed = config.badges.rekin;
        } else if (user.badges.includes(config.badges.hazardzista)) {
          baseChance += 0.01;
          badgeUsed = config.badges.hazardzista;
        }
      }

      const hasOko = hasItem(inventory, 'szkarlatne_oko');
      if (hasOko) {
        baseChance += 0.015;
      }

      const roll = crypto.randomInt(0, 10000);
      const won = roll < (baseChance * 10000);

      let badgeBonusChance = 0;
      if (badgeUsed) {
        if (badgeUsed === config.badges.bog) badgeBonusChance = 0.04;
        else if (badgeUsed === config.badges.rekin) badgeBonusChance = 0.02;
        else if (badgeUsed === config.badges.hazardzista) badgeBonusChance = 0.01;
      }

      let badgeSaved = false;
      let szkarlatneOkoSaved = false;
      if (won) {
        const baseThreshold = 0.45 * 10000;
        const badgeThreshold = baseThreshold + (badgeBonusChance * 10000);
        if (roll >= baseThreshold && roll < badgeThreshold) {
          badgeSaved = true;
        } else if (roll >= badgeThreshold && roll < badgeThreshold + (hasOko ? 150 : 0)) {
          szkarlatneOkoSaved = true;
        }
      }

      const flip = won ? choice : (choice === 'heads' ? 'tails' : 'heads');

      let payout = won ? bet * 2 : 0;
      if (won && user.badges && user.badges.includes(config.badges.uzalezniony)) {
        payout += Math.round(bet * 0.03);
      }
      user.balance += payout;

      const net = payout - bet;
      const xpResult = recordGame(user, net, 25, inventory);
      refreshBadges(user, inventory);

      return { won, bet, payout, net, flip, xpResult, secondChanceSaved: badgeSaved, szkarlatneOkoSaved, badgeUsed };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const outcome = displayChoice(result.flip);
    const winText = result.won ? `Wygrana! +${formatCurrency(result.net)}` : `Przegrana. -${formatCurrency(result.bet)}`;
    let replyText = `🪙 Coinflip: Wypadło **${outcome}**. ${winText}`;

    if (result.secondChanceSaved && result.badgeUsed) {
      replyText += `\n🍀 Odznaka **${result.badgeUsed}** dała Ci dodatkową szansę i uratowała przed przegraną!`;
    }
    if (result.szkarlatneOkoSaved) {
      replyText += `\n👁️ Przedmiot **Szkarłatne Oko Krupiera** dał Ci dodatkową szansę i uratował przed przegraną!`;
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
