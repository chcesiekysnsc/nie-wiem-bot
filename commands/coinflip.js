const config = require('../config/config');
const { ensureInventoryRecord, formatCurrency, hasItem, recordGame, refreshBadges, resolveAmount, getPassiveMultiplier, getActiveEventMultiplier } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { getEffectiveChance } = require('../utils/chances');

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

    const coinflipOverride = await getEffectiveChance(message.author.id, 'coinflip_win');

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const bet = resolveAmount(args[0], user.balance);

      if (!bet) return { error: '❌ Podaj poprawną kwotę betu.' };
      if (bet > user.balance) return { error: '❌ Brak wystarczających środków w portfelu.' };

      user.balance -= bet;

      const crypto = require('crypto');
      let baseChance = Number.isFinite(coinflipOverride) ? coinflipOverride / 100 : 0.485;
      let badgeUsed = '';

      if (user.badges) {
        if (user.badges.includes(config.badges.bog)) {
          baseChance += 0.015;
          badgeUsed = config.badges.bog;
        } else if (user.badges.includes(config.badges.rekin)) {
          baseChance += 0.01;
          badgeUsed = config.badges.rekin;
        } else if (user.badges.includes(config.badges.hazardzista)) {
          baseChance += 0.005;
          badgeUsed = config.badges.hazardzista;
        }
      }

      const hasOko = hasItem(inventory, 'szkarlatne_oko');
      if (hasOko) {
        baseChance += 0.015;
      }

      const ananasBonus = getPassiveMultiplier(inventory, 'ananas_na_pizzy', 0.02);
      baseChance += ananasBonus;

      const roll = crypto.randomInt(0, 10000);
      let won = roll < (baseChance * 10000);
      let dealerCheated = false;

      const hasDealerItem = hasItem(inventory, 'przekupiony_krupier');
      if (!won && hasDealerItem && Math.random() < 0.03) {
        won = true;
        dealerCheated = true;
      }

      let badgeBonusChance = 0;
      if (badgeUsed) {
        if (badgeUsed === config.badges.bog) badgeBonusChance = 0.015;
        else if (badgeUsed === config.badges.rekin) badgeBonusChance = 0.01;
        else if (badgeUsed === config.badges.hazardzista) badgeBonusChance = 0.005;
      }

      let badgeSaved = false;
      let szkarlatneOkoSaved = false;
      let ananasSaved = false;
      if (won && !dealerCheated) {
        const baseThreshold = 0.485 * 10000;
        const badgeThreshold = baseThreshold + (badgeBonusChance * 10000);
        const okoThreshold = badgeThreshold + (hasOko ? 150 : 0);
        const ananasThreshold = okoThreshold + (ananasBonus * 10000);
        if (roll >= baseThreshold && roll < badgeThreshold) {
          badgeSaved = true;
        } else if (roll >= badgeThreshold && roll < okoThreshold) {
          szkarlatneOkoSaved = true;
        } else if (roll >= okoThreshold && roll < ananasThreshold) {
          ananasSaved = true;
        }
      }

      let kosciRefunded = false;
      if (!won) {
        const kosciBonusPct = getPassiveMultiplier(inventory, 'kosci_oszusta', 0.02);
        if (kosciBonusPct > 0 && Math.random() < kosciBonusPct) {
          won = true;
          kosciRefunded = true;
        }
      }

      const flip = won ? choice : (choice === 'heads' ? 'tails' : 'heads');

      let payout = won ? (kosciRefunded ? bet : bet * 2) : 0;
      // Event casino mnożnik
      if (won && !kosciRefunded) {
        const evMul = getActiveEventMultiplier('casino');
        if (evMul > 1) {
          const profit = payout - bet;
          payout = bet + Math.round(profit * evMul);
        }
      }
      if (won && !kosciRefunded && user.badges && user.badges.includes(config.badges.uzalezniony)) {
        payout += Math.round(bet * 0.03);
      }

      let talizmanBonus = 0;
      if (won && !kosciRefunded) {
        const netGainBeforeTalizman = payout - bet;
        const { applyTalizmanBonus } = require('../utils/economy');
        talizmanBonus = applyTalizmanBonus(user, inventory, netGainBeforeTalizman);
        payout += talizmanBonus;
      }

      user.balance += payout;

      const net = payout - bet;
      const xpResult = recordGame(user, net, 25, inventory);
      refreshBadges(user, inventory);

      return { won, bet, payout, net, flip, xpResult, secondChanceSaved: badgeSaved, szkarlatneOkoSaved, ananasSaved, kosciRefunded, badgeUsed, dealerCheated, talizmanBonus, streak: user.gambleStreak || 0 };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const outcome = displayChoice(result.flip);
    const winText = result.won ? `Wygrana! +${formatCurrency(result.net)}` : `Przegrana. -${formatCurrency(result.bet)}`;
    let replyText = `🪙 Coinflip: Wypadło **${outcome}**. ${winText}`;

    if (result.won && result.talizmanBonus > 0) {
      replyText += `\n📿 **Talizman Fortuny:** Otrzymujesz bonus **+${formatCurrency(result.talizmanBonus)}** (seria: ${result.streak} wygranych pod rząd)`;
    }

    if (result.dealerCheated) {
      replyText += `\n🧠 **Przekupiony Krupier:** *Krupier zręcznie obrócił monetę w locie na **${outcome}**!*`;
    }
    if (result.secondChanceSaved && result.badgeUsed) {
      replyText += `\n🍀 Odznaka **${result.badgeUsed}** dała Ci dodatkową szansę i uratowała przed przegraną!`;
    }
    if (result.szkarlatneOkoSaved) {
      replyText += `\n👁️ Przedmiot **Szkarłatne Oko Krupiera** dał Ci dodatkową szansę i uratował przed przegraną!`;
    }
    if (result.ananasSaved) {
      replyText += `\n🍕 Przedmiot **Ananas na Pizzy** dał Ci dodatkową szansę i uratował przed przegraną!`;
    }
    if (result.kosciRefunded) {
      replyText += `\n🎲 Przedmiot **Kości Oszusta** uratował Cię przed stratą i zwrócił całą stawkę!`;
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
