const config = require('../config/config');
const {
  ensureInventoryRecord,
  formatCurrency,
  formatNumber,
  recordGame,
  refreshBadges,
  resolveAmount
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const MULTIPLIERS = {
  1: 150.00, 2: 75.00, 3: 50.00, 4: 37.50, 5: 30.00, 6: 24.00, 7: 19.00, 8: 15.00, 9: 12.00, 10: 10.00,
  11: 9.10, 12: 8.30, 13: 7.70, 14: 7.10, 15: 6.60, 16: 6.20, 17: 5.80, 18: 5.50, 19: 5.20, 20: 5.00,
  21: 4.75, 22: 4.50, 23: 4.30, 24: 4.10, 25: 4.00, 26: 3.85, 27: 3.70, 28: 3.55, 29: 3.40, 30: 3.30,
  31: 3.20, 32: 3.10, 33: 3.00, 34: 2.90, 35: 2.80, 36: 2.70, 37: 2.60, 38: 2.55, 39: 2.50, 40: 2.40,
  41: 2.35, 42: 2.30, 43: 2.25, 44: 2.20, 45: 2.15, 46: 2.10, 47: 2.05, 48: 2.02, 49: 2.01, 50: 2.00,
  51: 1.95, 52: 1.90, 53: 1.86, 54: 1.82, 55: 1.78, 56: 1.74, 57: 1.70, 58: 1.67, 59: 1.64, 60: 1.60,
  61: 1.57, 62: 1.54, 63: 1.51, 64: 1.48, 65: 1.45, 66: 1.43, 67: 1.41, 68: 1.39, 69: 1.37, 70: 1.35,
  71: 1.34, 72: 1.33, 73: 1.33, 74: 1.31, 75: 1.30, 76: 1.28, 77: 1.27, 78: 1.26, 79: 1.25, 80: 1.22,
  81: 1.20, 82: 1.18, 83: 1.16, 84: 1.15, 85: 1.14, 86: 1.13, 87: 1.12, 88: 1.11, 89: 1.10, 90: 1.08
};

module.exports = {
  name: 'bet',
  aliases: [],
  async execute(client, message, args) {
    const rawBet = args[0];
    const rawNum = args[1];

    const chosenNumber = Math.floor(Number(rawNum));
    if (isNaN(chosenNumber) || chosenNumber < 1 || chosenNumber > 90) {
      await message.reply('❌ Wybierz liczbę od **1 do 90** (np. **!bet 1000 50**).');
      return;
    }

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const bet = resolveAmount(rawBet, user.balance);

      if (!bet) {
        return { error: '❌ Podaj poprawną kwotę betu.' };
      }

      if (bet > user.balance) {
        return { error: `❌ Nie masz tylu monet. Posiadasz: ${formatCurrency(user.balance)}` };
      }

      let chanceBonus = 0;
      if (user.badges) {
        if (user.badges.includes(config.badges.bog)) chanceBonus += 2.0;
        else if (user.badges.includes(config.badges.rekin)) chanceBonus += 1.0;
        else if (user.badges.includes(config.badges.hazardzista)) chanceBonus += 0.5;
      }
      if (hasItem(inventory, 'szkarlatne_oko')) {
        chanceBonus += 1.5;
      }

      // Losowanie liczby 0-99
      const rolledNumber = Math.floor(Math.random() * 100);
      const won = rolledNumber < (chosenNumber + chanceBonus);
      const multiplier = MULTIPLIERS[chosenNumber];

      let winAmount = 0;
      if (won) {
        winAmount = Math.round(bet * multiplier) - bet;
        if (user.badges && user.badges.includes(config.badges.uzalezniony)) {
          winAmount = Math.round(winAmount * 1.03);
        }
        user.balance += winAmount;
      } else {
        user.balance -= bet;
      }

      const net = won ? winAmount : -bet;
      const xpResult = recordGame(user, net, 25, inventory);
      refreshBadges(user, inventory);

      return {
        won,
        rolledNumber,
        net,
        xpResult,
        balance: user.balance
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const winText = result.won ? `Wygrana! **+${formatCurrency(result.net)}**` : `Przegrana. **-${formatCurrency(Math.abs(result.net))}**`;
    let replyText = `🎰 Bet: Wylosowano **${result.rolledNumber}** (Typ: < ${chosenNumber}). ${winText}. Twój balans: **${formatCurrency(result.balance)}**`;

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
