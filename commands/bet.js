const config = require('../config/config');
const {
  addXp,
  ensureInventoryRecord,
  formatCurrency,
  formatNumber,
  hasItem,
  recordGame,
  refreshBadges,
  resolveAmount,
  getPassiveMultiplier,
  getActiveEventMultiplier,
  getCasinoWinMultiplier,
  getRandomXp
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { getEffectiveChance } = require('../utils/chances');
const { advanceChallenge } = require('../utils/challenges');

const SINGLE_MULTIPLIERS = {
  1: 65,
  2: 30,
  3: 25,
  4: 18,
  5: 14,
  6: 12,
  7: 11.5,
  8: 11,
  9: 10,
  10: 9,
  11: 8.00,
  12: 7.60,
  13: 7.20,
  14: 6.80,
  15: 6.40,
  16: 6.10,
  17: 5.80,
  18: 5.50,
  19: 5.20,
  20: 4.95,
  21: 4.70,
  22: 4.45,
  23: 4.25,
  24: 4.05,
  25: 3.85,
  26: 3.65,
  27: 3.50,
  28: 3.35,
  29: 3.20,
  30: 3.05,
  31: 2.90,
  32: 2.75,
  33: 2.60,
  34: 2.50,
  35: 2.40,
  36: 2.30,
  37: 2.20,
  38: 2.10,
  39: 2.02,
  40: 1.95,
  41: 1.88,
  42: 1.82,
  43: 1.76,
  44: 1.70,
  45: 1.65,
  46: 1.60,
  47: 1.56,
  48: 1.53,
  49: 1.51,
  50: 1.50,
  51: 1.49,
  52: 1.48,
  53: 1.47,
  54: 1.46,
  55: 1.45,
  56: 1.44,
  57: 1.43,
  58: 1.42,
  59: 1.41,
  60: 1.40,
  61: 1.39,
  62: 1.38,
  63: 1.37,
  64: 1.36,
  65: 1.35,
  66: 1.345,
  67: 1.34,
  68: 1.338,
  69: 1.336,
  70: 1.334,
  71: 1.332,
  72: 1.331,
  73: 1.33,
  74: 1.31,
  75: 1.29,
  76: 1.27,
  77: 1.25,
  78: 1.23,
  79: 1.21,
  80: 1.19,
  81: 1.17,
  82: 1.15,
  83: 1.13,
  84: 1.11,
  85: 1.09,
  86: 1.07,
  87: 1.05,
  88: 1.04,
  89: 1.03,
  90: 1.02
};
const MULTI_MULTIPLIERS = {
  1: 50,
  2: 28,
  3: 22,
  4: 17,
  5: 13,
  6: 11,
  7: 10.5,
  8: 10,
  9: 9,
  10: 8.5,
  11: 8.00,
  12: 7.65,
  13: 7.30,
  14: 6.95,
  15: 6.65,
  16: 6.35,
  17: 6.10,
  18: 5.85,
  19: 5.60,
  20: 5.35,
  21: 5.15,
  22: 4.95,
  23: 4.75,
  24: 4.55,
  25: 4.35,
  26: 4.20,
  27: 4.05,
  28: 3.90,
  29: 3.75,
  30: 3.60,
  31: 3.45,
  32: 3.30,
  33: 3.15,
  34: 3.00,
  35: 2.85,
  36: 2.72,
  37: 2.60,
  38: 2.48,
  39: 2.36,
  40: 2.24,
  41: 2.12,
  42: 2.02,
  43: 1.92,
  44: 1.82,
  45: 1.72,
  46: 1.63,
  47: 1.56,
  48: 1.50,
  49: 1.47,
  50: 1.44,
  51: 1.42,
  52: 1.40,
  53: 1.38,
  54: 1.36,
  55: 1.34,
  56: 1.32,
  57: 1.30,
  58: 1.28,
  59: 1.26,
  60: 1.24,
  61: 1.22,
  62: 1.20,
  63: 1.18,
  64: 1.16,
  65: 1.14,
  66: 1.12,
  67: 1.10,
  68: 1.09,
  69: 1.08,
  70: 1.07,
  71: 1.06,
  72: 1.055,
  73: 1.050,
  74: 1.045,
  75: 1.040,
  76: 1.038,
  77: 1.036,
  78: 1.034,
  79: 1.032,
  80: 1.030,
  81: 1.028,
  82: 1.026,
  83: 1.024,
  84: 1.023,
  85: 1.022,
  86: 1.021,
  87: 1.020,
  88: 1.020,
  89: 1.020,
  90: 1.020
};

module.exports = {
  name: 'bet',
  aliases: [],
  async execute(client, message, args) {
    const rawBet = args[0];
    const rawNum = args[1];
    const rawCount = args[2];

    const chosenNumber = Math.floor(Number(rawNum));
    const isCreator = message.author.id === '100060812419294';

    let isMulti = false;
    let count = 1;

    if (rawCount !== undefined) {
      count = parseInt(rawCount, 10);
      if (isNaN(count) || count <= 0) {
        await message.reply('❌ Podaj poprawną ilość betów (liczba dodatnia).');
        return;
      }
      if (count > 1) {
        const isCreator = message.author.id === '100060812419294';
        const isAdmin = config.admins.includes(message.author.id);
        if (isCreator) {
          if (count > 1000) {
            await message.reply('❌ Seryjne obstawianie (multi-bet) ma limit **1000** na raz.');
            return;
          }
        } else if (isAdmin) {
          if (count > 100) {
            await message.reply('❌ Seryjne obstawianie (multi-bet) dla administratorów ma limit **100** na raz.');
            return;
          }
        } else {
          if (count > 25) {
            await message.reply('❌ Seryjne obstawianie (multi-bet) dla zwykłych użytkowników ma limit **25** na raz.');
            return;
          }
        }
        isMulti = true;
      }
    }

    if (isMulti) {
      const multiMin = isCreator ? 1 : 5;
      if (isNaN(chosenNumber) || chosenNumber < multiMin || chosenNumber > 90) {
        await message.reply(`❌ W seryjnym obstawianiu (multi-bet) dozwolony zakres liczby to **${multiMin}–90**.`);
        return;
      }
    } else {
      if (isNaN(chosenNumber) || chosenNumber < 1 || chosenNumber > 90) {
        await message.reply('❌ Wybierz liczbę od **1 do 90** (np. **!bet 1000 50**).');
        return;
      }
    }

    if (!isMulti) {
      const betLuckOverride = await getEffectiveChance(message.author.id, 'bet_win_luck');
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

        user.balance -= bet;

        let badgeBonus = 0;
        let activeBadgeName = '';
        const hazardzistaBadge = config.badges.hazardzista;
        const bogBadge = config.badges.bog;
        const rekinBadge = config.badges.rekin;
        const isBadgeEligible = chosenNumber > 2;
        const isHazardzistaEligible = user.badges && user.badges.includes(hazardzistaBadge) && isBadgeEligible;
        const isBogEligible = user.badges && user.badges.includes(bogBadge) && isBadgeEligible;
        const isRekinEligible = user.badges && user.badges.includes(rekinBadge) && isBadgeEligible;
        if (user.badges) {
          if (isBogEligible) {
            badgeBonus = 1.5;
            activeBadgeName = bogBadge;
          } else if (isRekinEligible) {
            badgeBonus = 1.0;
            activeBadgeName = rekinBadge;
          } else if (isHazardzistaEligible) {
            badgeBonus = 0.5;
            activeBadgeName = hazardzistaBadge;
          }
        }
        const hasOko = hasItem(inventory, 'szkarlatne_oko');
        const okoBonus = hasOko ? 1.5 : 0;
        
        const ananasMultiplier = getPassiveMultiplier(inventory, 'ananas_na_pizzy', 0.02);
        const ananasBonus = ananasMultiplier * 100;

        const totalBonus = badgeBonus + okoBonus + ananasBonus;
        const finalBonus = totalBonus + (Number.isFinite(betLuckOverride) ? betLuckOverride : 0);

        const rolledFloat = Math.random() * 100;
        let won = rolledFloat < (chosenNumber + finalBonus);
        const rolledNumber = Math.floor(rolledFloat);
        const multiplier = SINGLE_MULTIPLIERS[chosenNumber];

        let badgeSaved = false;
        let szkarlatneOkoSaved = false;
        let ananasSaved = false;
        let kosciRefunded = false;

        if (won) {
          if (rolledFloat >= chosenNumber && rolledFloat < chosenNumber + badgeBonus) {
            badgeSaved = true;
          } else if (rolledFloat >= chosenNumber + badgeBonus && rolledFloat < chosenNumber + badgeBonus + okoBonus) {
            szkarlatneOkoSaved = true;
          } else if (rolledFloat >= chosenNumber + badgeBonus + okoBonus && rolledFloat < chosenNumber + finalBonus) {
            ananasSaved = true;
          }
        }

        if (!won) {
          const kosciBonusPct = getPassiveMultiplier(inventory, 'kosci_oszusta', 0.02);
          if (kosciBonusPct > 0 && Math.random() < kosciBonusPct) {
            won = true;
            kosciRefunded = true;
          }
        }

        let payout = 0;
        let talizmanBonus = 0;
        if (won) {
          if (kosciRefunded) {
            payout = bet;
          } else {
            payout = Math.round(bet * multiplier);
            const evMul = getActiveEventMultiplier('casino');
            if (evMul > 1) {
              payout = Math.round(payout * evMul);
            }
            if (user.badges && user.badges.includes(config.badges.uzalezniony)) {
              payout = Math.round(payout * 1.03);
            }
            if (hasItem(inventory, 'krolewskie_insygnia')) {
              const profit = payout - bet;
              if (profit > 0) {
                payout += Math.floor(profit * 0.10);
              }
            }
            const casinoWinBonus = getCasinoWinMultiplier(inventory);
            if (casinoWinBonus > 0) {
              const profit = payout - bet;
              if (profit > 0) {
                payout += Math.floor(profit * casinoWinBonus);
              }
            }
            const { applyTalizmanBonus } = require('../utils/economy');
            talizmanBonus = applyTalizmanBonus(user, inventory, payout - bet);
            payout += talizmanBonus;
          }
          user.balance += payout;
        }

        const net = won ? payout - bet : -bet;
        const xpResult = recordGame(user, net, getRandomXp(), inventory);
        refreshBadges(user, inventory);

        const challengeUpdate = advanceChallenge(message.author.id, store, 'bet_count');
        const challengeVolumeUpdate = advanceChallenge(message.author.id, store, 'bet_volume', bet);
        const challengeStreakUpdate = advanceChallenge(message.author.id, store, 'bet_streak_under74', won ? 1 : 0, { betAmount: bet, chosenNumber, won });

        return {
          won,
          rolledNumber,
          net,
          xpResult,
          balance: user.balance,
          badgeSaved,
          szkarlatneOkoSaved,
          ananasSaved,
          kosciRefunded,
          activeBadgeName,
          talizmanBonus,
          streak: user.gambleStreak || 0,
          challengeUpdate,
          challengeVolumeUpdate,
          challengeStreakUpdate
        };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      const winText = result.won ? `Wygrana! **+${formatCurrency(result.net)}**` : `Przegrana. **-${formatCurrency(Math.abs(result.net))}**`;
      let replyText = `🎰 Bet: Wylosowano **${result.rolledNumber}** (Typ: < ${chosenNumber}). ${winText}. Twój balans: **${formatCurrency(result.balance)}**`;

      if (result.won && result.talizmanBonus > 0) {
        replyText += `\n📿 **Talizman Fortuny:** Otrzymujesz bonus **+${formatCurrency(result.talizmanBonus)}** (seria: ${result.streak} wygranych pod rząd)`;
      }

      if (result.badgeSaved && result.activeBadgeName) {
        replyText += `\n🍀 Odznaka **${result.activeBadgeName}** dała Ci dodatkową szansę i uratowała przed przegraną!`;
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
      return;
    }

    const betLuckOverrideMulti = await getEffectiveChance(message.author.id, 'bet_win_luck');

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);

      const isCreator = message.author.id === '100060812419294';
      const casinoMul = getActiveEventMultiplier('casino');
      const hasCasinoEvent = !isCreator && casinoMul > 1;

      if (hasCasinoEvent) {
        const usage = store.profiles.eventCasinoMultiBetUsage || {};
        const currentUsage = usage[message.author.id] || 0;
        if (currentUsage + count > 100) {
          return { error: `❌ Limit seryjnych obstawień podczas bonusu kasyna: użyłeś już **${currentUsage}/100** zakładów.` };
        }
        usage[message.author.id] = currentUsage + count;
        store.profiles.eventCasinoMultiBetUsage = usage;
      }

      const initialBalance = user.balance;
      const startLevel = user.level;
      const startPrestige = user.prestige;

      let wins = 0;
      let losses = 0;
      let badgeSaves = 0;
      let okoSaves = 0;
      let ananasSaves = 0;
      let kosciRefunds = 0;
      let totalBets = 0;
      let totalBetVolume = 0;
      let challengeStreakUpdate = null;
      let accumulatedMilestones = [];

      let interrupted = false;
      let interruptedAt = 0;
      let interruptedReason = '';

      for (let i = 1; i <= count; i++) {
        const isCreator = message.author.id === '100060812419294';
        let betAmount = resolveAmount(rawBet, user.balance);
        if (isCreator && (betAmount === null || betAmount <= 0)) {
          betAmount = resolveAmount(rawBet, 1000000000);
        }

        if (betAmount === null || betAmount <= 0) {
          interrupted = true;
          interruptedAt = i;
          interruptedReason = `brak środków na koncie (balans: ${formatCurrency(user.balance)})`;
          break;
        }
        if (!isCreator && betAmount > user.balance) {
          interrupted = true;
          interruptedAt = i;
          interruptedReason = `brak wystarczających środków (potrzebne: ${formatCurrency(betAmount)}, posiadasz: ${formatCurrency(user.balance)})`;
          break;
        }

        let badgeBonus = 0;
        const isBadgeEligible = chosenNumber > 2;
        const isHazardzistaEligible = user.badges && user.badges.includes(config.badges.hazardzista) && isBadgeEligible;
        const isBogEligible = user.badges && user.badges.includes(config.badges.bog) && isBadgeEligible;
        const isRekinEligible = user.badges && user.badges.includes(config.badges.rekin) && isBadgeEligible;
        if (user.badges) {
          if (isBogEligible) {
            badgeBonus = 0.25;
          } else if (isRekinEligible) {
            badgeBonus = 0.12;
          } else if (isHazardzistaEligible) {
            badgeBonus = 0.06;
          }
        }
        const hasOko = hasItem(inventory, 'szkarlatne_oko');
        const okoBonus = hasOko ? 0.75 : 0;
        
        const ananasMultiplier = getPassiveMultiplier(inventory, 'ananas_na_pizzy', 0.02);
        const ananasBonus = ananasMultiplier * 50;

        const totalBonus = badgeBonus + okoBonus + ananasBonus;
        const finalBonus = totalBonus + (Number.isFinite(betLuckOverrideMulti) ? betLuckOverrideMulti / 2 : 0);

        const rolledFloat = Math.random() * 100;
        let won = rolledFloat < (chosenNumber + finalBonus);
        const multiplier = MULTI_MULTIPLIERS[chosenNumber];

        if (won) {
          if (rolledFloat >= chosenNumber && rolledFloat < chosenNumber + badgeBonus) {
            badgeSaves++;
          } else if (rolledFloat >= chosenNumber + badgeBonus && rolledFloat < chosenNumber + badgeBonus + okoBonus) {
            okoSaves++;
          } else if (rolledFloat >= chosenNumber + badgeBonus + okoBonus && rolledFloat < chosenNumber + finalBonus) {
            ananasSaves++;
          }
        }

        let kosciRefundedThisRoll = false;
        if (!won) {
          const kosciBonusPct = getPassiveMultiplier(inventory, 'kosci_oszusta', 0.02);
          if (kosciBonusPct > 0 && Math.random() < kosciBonusPct) {
            won = true;
            kosciRefundedThisRoll = true;
            kosciRefunds++;
          }
        }

        let winAmount = 0;
        if (won) {
          if (kosciRefundedThisRoll) {
            winAmount = 0;
          } else {
            winAmount = Math.round(betAmount * multiplier) - betAmount;
            const evMul = getActiveEventMultiplier('casino');
            if (evMul > 1) {
              winAmount = Math.round(winAmount * evMul);
            }
            if (user.badges && user.badges.includes(config.badges.uzalezniony)) {
              winAmount = Math.round(winAmount * 1.03);
            }
            if (hasItem(inventory, 'krolewskie_insygnia')) {
              if (winAmount > 0) {
                winAmount += Math.floor(winAmount * 0.10);
              }
            }
            const casinoWinBonus = getCasinoWinMultiplier(inventory);
            if (casinoWinBonus > 0 && winAmount > 0) {
              winAmount += Math.floor(winAmount * casinoWinBonus);
            }
            user.balance += winAmount;
          }
          wins++;
        } else {
          user.balance -= betAmount;
          losses++;
        }

        totalBets++;
        totalBetVolume += betAmount;
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
        challengeStreakUpdate = advanceChallenge(message.author.id, store, 'bet_streak_under74', won ? 1 : 0, { betAmount, chosenNumber, won });
      }

      const xpResult = addXp(user, getRandomXp(), inventory);
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

      const challengeUpdate = advanceChallenge(message.author.id, store, 'bet_count', totalBets);
      const challengeVolumeUpdate = advanceChallenge(message.author.id, store, 'bet_volume', totalBetVolume);

      return {
        initialBalance,
        finalBalance: user.balance,
        wins,
        losses,
        badgeSaves,
        okoSaves,
        ananasSaves,
        kosciRefunds,
        totalBets,
        interrupted,
        interruptedAt,
        interruptedReason,
        leveledUp,
        finalLevel,
        accumulatedMilestones,
        hasOko,
        hasBadge,
        hasAnanas: getPassiveMultiplier(inventory, 'ananas_na_pizzy', 0.02) > 0,
        hasKosci: getPassiveMultiplier(inventory, 'kosci_oszusta', 0.02) > 0,
        challengeUpdate,
        challengeVolumeUpdate,
        challengeStreakUpdate
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
    if (result.hasAnanas) {
      savesText += `• Ananas na Pizzy: **${result.ananasSaves}** razy\n`;
    }
    if (result.hasKosci) {
      savesText += `• Kości Oszusta (zwrot): **${result.kosciRefunds}** razy\n`;
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
