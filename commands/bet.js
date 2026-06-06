const config = require('../config/config');
const {
  addXp,
  ensureInventoryRecord,
  formatCurrency,
  formatNumber,
  hasItem,
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
    const rawCount = args[2];

    const chosenNumber = Math.floor(Number(rawNum));
    if (isNaN(chosenNumber) || chosenNumber < 1 || chosenNumber > 90) {
      await message.reply('❌ Wybierz liczbę od **1 do 90** (np. **!bet 1000 50**).');
      return;
    }

    let isMulti = false;
    let count = 1;

    if (rawCount !== undefined) {
      count = parseInt(rawCount, 10);
      if (isNaN(count) || count <= 0) {
        await message.reply('❌ Podaj poprawną ilość betów (liczba dodatnia).');
        return;
      }
      if (count > 1) {
        if (!config.admins.includes(message.author.id)) {
          await message.reply('❌ Seryjne obstawianie (multi-bet) jest dostępne tylko dla administratorów.');
          return;
        }
        if (count > 10000000) {
          await message.reply('❌ Maksymalna ilość betów w serii to **10 000 000**.');
          return;
        }
        isMulti = true;
      }
    }

    if (!isMulti) {
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

        let badgeBonus = 0;
        let activeBadgeName = '';
        if (user.badges) {
          if (user.badges.includes(config.badges.bog)) {
            badgeBonus = 2.0;
            activeBadgeName = config.badges.bog;
          } else if (user.badges.includes(config.badges.rekin)) {
            badgeBonus = 1.0;
            activeBadgeName = config.badges.rekin;
          } else if (user.badges.includes(config.badges.hazardzista)) {
            badgeBonus = 0.5;
            activeBadgeName = config.badges.hazardzista;
          }
        }
        const hasOko = hasItem(inventory, 'szkarlatne_oko');
        const okoBonus = hasOko ? 1.5 : 0;
        const totalBonus = badgeBonus + okoBonus;

        const rolledNumber = Math.floor(Math.random() * 100);
        const won = rolledNumber < (chosenNumber + totalBonus);
        const multiplier = MULTIPLIERS[chosenNumber];

        let badgeSaved = false;
        let szkarlatneOkoSaved = false;
        if (won) {
          if (rolledNumber >= chosenNumber && rolledNumber < chosenNumber + badgeBonus) {
            badgeSaved = true;
          } else if (rolledNumber >= chosenNumber + badgeBonus && rolledNumber < chosenNumber + totalBonus) {
            szkarlatneOkoSaved = true;
          }
        }

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
          balance: user.balance,
          badgeSaved,
          szkarlatneOkoSaved,
          activeBadgeName
        };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      const winText = result.won ? `Wygrana! **+${formatCurrency(result.net)}**` : `Przegrana. **-${formatCurrency(Math.abs(result.net))}**`;
      let replyText = `🎰 Bet: Wylosowano **${result.rolledNumber}** (Typ: < ${chosenNumber}). ${winText}. Twój balans: **${formatCurrency(result.balance)}**`;

      if (result.badgeSaved && result.activeBadgeName) {
        replyText += `\n🍀 Odznaka **${result.activeBadgeName}** dała Ci dodatkową szansę i uratowała przed przegraną!`;
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
      return;
    }

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);

      const initialBalance = user.balance;
      const startLevel = user.level;
      const startPrestige = user.prestige;

      let wins = 0;
      let losses = 0;
      let badgeSaves = 0;
      let okoSaves = 0;
      let totalBets = 0;
      let accumulatedMilestones = [];

      let interrupted = false;
      let interruptedAt = 0;
      let interruptedReason = '';

      for (let i = 1; i <= count; i++) {
        const betAmount = resolveAmount(rawBet, user.balance);
        if (betAmount === null || betAmount <= 0) {
          interrupted = true;
          interruptedAt = i;
          interruptedReason = `brak środków na koncie (balans: ${formatCurrency(user.balance)})`;
          break;
        }
        if (betAmount > user.balance) {
          interrupted = true;
          interruptedAt = i;
          interruptedReason = `brak wystarczających środków (potrzebne: ${formatCurrency(betAmount)}, posiadasz: ${formatCurrency(user.balance)})`;
          break;
        }

        let badgeBonus = 0;
        if (user.badges) {
          if (user.badges.includes(config.badges.bog)) {
            badgeBonus = 2.0;
          } else if (user.badges.includes(config.badges.rekin)) {
            badgeBonus = 1.0;
          } else if (user.badges.includes(config.badges.hazardzista)) {
            badgeBonus = 0.5;
          }
        }
        const hasOko = hasItem(inventory, 'szkarlatne_oko');
        const okoBonus = hasOko ? 1.5 : 0;
        const totalBonus = badgeBonus + okoBonus;

        const rolledNumber = Math.floor(Math.random() * 100);
        const won = rolledNumber < (chosenNumber + totalBonus);
        const multiplier = MULTIPLIERS[chosenNumber];

        if (won) {
          if (rolledNumber >= chosenNumber && rolledNumber < chosenNumber + badgeBonus) {
            badgeSaves++;
          } else if (rolledNumber >= chosenNumber + badgeBonus && rolledNumber < chosenNumber + totalBonus) {
            okoSaves++;
          }
        }

        let winAmount = 0;
        if (won) {
          winAmount = Math.round(betAmount * multiplier) - betAmount;
          if (user.badges && user.badges.includes(config.badges.uzalezniony)) {
            winAmount = Math.round(winAmount * 1.03);
          }
          user.balance += winAmount;
          wins++;
        } else {
          user.balance -= betAmount;
          losses++;
        }

        totalBets++;
        const net = won ? winAmount : -betAmount;
        
        user.gamesPlayed += 1;
        if (net >= 0) {
          user.totalWon += net;
          user.wins = (user.wins || 0) + 1;
        } else {
          user.totalLost += Math.abs(net);
          user.losses = (user.losses || 0) + 1;
        }

        refreshBadges(user, inventory);
      }

      // Dajemy XP i kamienie milowe tylko raz za całe użycie komendy
      const xpResult = addXp(user, 25, inventory);
      if (xpResult.leveledUp && xpResult.milestonesGained) {
        accumulatedMilestones.push(...xpResult.milestonesGained);
      }
      refreshBadges(user, inventory);

      const finalLevel = user.prestige > 0 ? `${user.level} [Prestiż ${user.prestige}]` : user.level;
      const leveledUp = (user.level !== startLevel || user.prestige !== startPrestige);

      return {
        initialBalance,
        finalBalance: user.balance,
        wins,
        losses,
        badgeSaves,
        okoSaves,
        totalBets,
        interrupted,
        interruptedAt,
        interruptedReason,
        leveledUp,
        finalLevel,
        accumulatedMilestones
      };
    });

    const netChange = result.finalBalance - result.initialBalance;
    const netSign = netChange >= 0 ? '+' : '';

    let replyText = '';
    if (result.interrupted) {
      replyText += `⚠️ **Seria betów została przerwana na ${result.interruptedAt}. becie!**\n`;
      replyText += `**Powód:** ${result.interruptedReason}\n\n`;
    } else {
      replyText += `🎰 **Seria betów zakończona pomyślnie!**\n\n`;
    }

    replyText += `📊 **Statystyki serii:**\n`;
    replyText += `• Wykonane zakłady: **${result.totalBets}**\n`;
    replyText += `• Wygrane: **${result.wins}** ✅\n`;
    replyText += `• Przegrane: **${result.losses}** ❌\n`;
    replyText += `• Zmiana salda: **${netSign}${formatCurrency(netChange)}**\n`;
    replyText += `• Obecny stan konta: **${formatCurrency(result.finalBalance)}**\n\n`;

    replyText += `🛡️ **Uaktywnione przedmioty ratujące:**\n`;
    replyText += `• Szkarłatne Oko Krupiera: **${result.okoSaves}** razy\n`;
    replyText += `• Bonus z odznak: **${result.badgeSaves}** razy`;

    if (result.leveledUp) {
      replyText += `\n\n🎉 **AWANS!** Awansowałeś na **poziom ${result.finalLevel}**!`;
      if (result.accumulatedMilestones && result.accumulatedMilestones.length > 0) {
        const { getMilestoneRewardDescription } = require('../utils/economy');
        for (const lvl of result.accumulatedMilestones) {
          replyText += `\n🎁 Nagroda za kamień milowy poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
        }
      }
    }

    await message.reply(replyText);
  }
};
