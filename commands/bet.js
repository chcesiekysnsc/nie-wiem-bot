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

const SINGLE_MULTIPLIERS = {};
const MULTI_MULTIPLIERS = {};
for (let i = 5; i <= 90; i++) {
  SINGLE_MULTIPLIERS[i] = parseFloat((98 / i).toFixed(2));
  MULTI_MULTIPLIERS[i] = parseFloat((90 / i).toFixed(2));
}

module.exports = {
  name: 'bet',
  aliases: [],
  async execute(client, message, args) {
    const rawBet = args[0];
    const rawNum = args[1];
    const rawCount = args[2];

    const chosenNumber = Math.floor(Number(rawNum));
    if (isNaN(chosenNumber) || chosenNumber < 5 || chosenNumber > 90) {
      await message.reply('❌ Wybierz liczbę od **5 do 90** (np. **!bet 1000 50**).');
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
        const isAdmin = config.admins.includes(message.author.id);
        if (!isAdmin && count > 25) {
          await message.reply('❌ Seryjne obstawianie (multi-bet) dla zwykłych użytkowników ma limit **25** na raz.');
          return;
        }
        if (isAdmin && count > 100) {
          await message.reply('❌ Seryjne obstawianie (multi-bet) dla administratorów ma limit **100** na raz.');
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
            badgeBonus = 1.5;
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
        const multiplier = SINGLE_MULTIPLIERS[chosenNumber];

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
            badgeBonus = 0.25; // Bóg Kasyna: 0.25% instead of 1.5% during multibet
          } else if (user.badges.includes(config.badges.rekin)) {
            badgeBonus = 0.12; // Rekin Kasyna: 0.12% instead of 1.0% during multibet
          } else if (user.badges.includes(config.badges.hazardzista)) {
            badgeBonus = 0.06; // Hazardzista: 0.06% instead of 0.5% during multibet
          }
        }
        const hasOko = hasItem(inventory, 'szkarlatne_oko');
        const okoBonus = hasOko ? 0.75 : 0; // Szkarłatne Oko: 0.75% instead of 1.5% during multibet
        const totalBonus = badgeBonus + okoBonus;

        const rolledNumber = Math.floor(Math.random() * 100);
        const won = rolledNumber < (chosenNumber + totalBonus);
        const multiplier = MULTI_MULTIPLIERS[chosenNumber];

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

      const hasOko = hasItem(inventory, 'szkarlatne_oko');
      const hasBadge = user.badges && (
        user.badges.includes(config.badges.bog) || 
        user.badges.includes(config.badges.rekin) || 
        user.badges.includes(config.badges.hazardzista)
      );

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
        accumulatedMilestones,
        hasOko,
        hasBadge
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
    replyText += `• Obecny stan konta: **${formatCurrency(result.finalBalance)}**\n`;
 
    let savesText = '';
    if (result.hasOko) {
      savesText += `• Szkarłatne Oko Krupiera: **${result.okoSaves}** razy\n`;
    }
    if (result.hasBadge) {
      savesText += `• Bonus z odznak: **${result.badgeSaves}** razy\n`;
    }
    if (savesText) {
      replyText += `\n🛡️ **Uaktywnione przedmioty ratujące:**\n` + savesText.trim();
    }

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
