const fs = require('fs');
const path = require('path');
const { withData, createUser } = require('./storage');
const { formatCurrency, refreshBadges, ensureInventoryRecord, randomInt, recordGame } = require('./economy');

const BETS_FILE = path.join(__dirname, '..', 'data', 'active_bets.json');

function loadBets() {
  try {
    if (!fs.existsSync(BETS_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(BETS_FILE, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('[BETS] Error loading active bets:', err);
    return {};
  }
}

function saveBets(bets) {
  try {
    fs.writeFileSync(BETS_FILE, JSON.stringify(bets, null, 2), 'utf8');
  } catch (err) {
    console.error('[BETS] Error saving active bets:', err);
  }
}

function addActiveBet(userId, betData) {
  const bets = loadBets();
  bets[userId] = {
    ...betData,
    timestamp: Date.now()
  };
  saveBets(bets);
}

function removeActiveBet(userId) {
  const bets = loadBets();
  if (bets[userId]) {
    delete bets[userId];
    saveBets(bets);
  }
}

async function resolvePendingBets(api) {
  const bets = loadBets();
  const userIds = Object.keys(bets);
  if (userIds.length === 0) return;

  console.log(`[BETS] Found ${userIds.length} pending bets during startup. Resolving...`);

  for (const userId of userIds) {
    const betData = bets[userId];
    try {
      if (betData.isMulti) {
        // Multi-bet resolution
        await resolveSingleMultiBet(api, userId, betData);
      } else {
        // Single match resolution
        await resolveSingleMatchBet(api, userId, betData);
      }
    } catch (err) {
      console.error(`[BETS] Failed to resolve pending bet for user ${userId}:`, err);
    } finally {
      // Remove it so we don't resolve it twice
      removeActiveBet(userId);
    }
  }
}

async function resolveSingleMatchBet(api, userId, betData) {
  const { threadId, bet, rawType, match } = betData;
  const outcomeResult = await withData(store => {
    const user = createUser(userId, store.users);
    const inventory = ensureInventoryRecord(store.inventory, userId);

    const roll = Math.random();
    let outcome = 'x';
    let homeGoals = 0;
    let awayGoals = 0;
    const diff = match.diff || 0;

    if (roll < match.probabilities.home) {
      outcome = '1';
      let maxGoals = 4;
      if (diff > 15) maxGoals = 5;
      if (diff > 25) maxGoals = 6;
      homeGoals = randomInt(diff > 25 ? 2 : 1, maxGoals);
      awayGoals = randomInt(0, homeGoals - 1);
    } else if (roll < match.probabilities.home + match.probabilities.draw) {
      outcome = 'x';
      homeGoals = randomInt(0, 3);
      awayGoals = homeGoals;
    } else {
      outcome = '2';
      let maxGoals = 4;
      if (diff < -15) maxGoals = 5;
      if (diff < -25) maxGoals = 6;
      awayGoals = randomInt(diff < -25 ? 2 : 1, maxGoals);
      homeGoals = randomInt(0, awayGoals - 1);
    }

    const won = rawType === outcome;
    const odds = match.odds[rawType];
    const potentialWin = Math.round(bet * odds);
    let net = 0;

    if (won) {
      const tax = Math.round(potentialWin * 0.15);
      const payout = potentialWin - tax;
      net = payout - bet;
      user.balance += payout;
    } else {
      net = -bet;
    }

    const xpResult = recordGame(user, net, 25, inventory);
    refreshBadges(user, inventory);

    return {
      won,
      net,
      homeGoals,
      awayGoals,
      outcome,
      balance: user.balance,
      xpResult
    };
  });

  const typeLabels = {
    1: match.home,
    x: 'Remis',
    2: match.away
  };
  const odds = match.odds[rawType];

  let replyText = 
    `⚽ **PRZERWANY ZAKŁAD ODZYSKANY** ⚽\n` +
    `Mecz: **${match.home}** vs **${match.away}**\n` +
    `Twój typ: **${typeLabels[rawType]}** (kurs: **${odds}**)\n\n` +
    `🏁 **Wynik meczu: ${outcomeResult.homeGoals} - ${outcomeResult.awayGoals}**\n\n`;

  if (outcomeResult.won) {
    const tax = Math.round(potentialWin * 0.15);
    replyText += `🎉 Gratulacje! Twój kupon jest **WYGRANY**! Zysk netto: **+${formatCurrency(outcomeResult.net)}** (Wygrana brutto: ${formatCurrency(potentialWin)}, podatek 15%: -${formatCurrency(tax)})\n`;
  } else {
    replyText += `💀 Niestety, Twój kupon jest **PRZEGRANY**. Strata: **-${formatCurrency(Math.abs(outcomeResult.net))}**\n`;
  }

  replyText += `💰 Twój balans: **${formatCurrency(outcomeResult.balance)}**`;

  if (outcomeResult.xpResult && outcomeResult.xpResult.leveledUp) {
    replyText += `\n🎉 **AWANS!** Awansowałeś na **poziom ${outcomeResult.xpResult.newLevel}**!`;
    if (outcomeResult.xpResult.milestonesGained && outcomeResult.xpResult.milestonesGained.length > 0) {
      const { getMilestoneRewardDescription } = require('./economy');
      for (const lvl of outcomeResult.xpResult.milestonesGained) {
        replyText += `\n🎁 Otrzymałeś nagrodę za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
      }
    }
  }

  await new Promise((resolve, reject) => {
    api.sendMessage(replyText, threadId, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function resolveSingleMultiBet(api, userId, betData) {
  const { threadId, totalStake, combinedOdds, potentialWin, matchDetails } = betData;

  const outcomeResult = await withData(store => {
    const user = createUser(userId, store.users);
    const inventory = ensureInventoryRecord(store.inventory, userId);

    let ticketWon = true;
    const matchResults = [];

    for (const m of matchDetails) {
      const roll = Math.random();
      let outcome = 'x';
      let homeGoals = 0;
      let awayGoals = 0;
      const diff = m.diff || 0;

      if (roll < m.probabilities.home) {
        outcome = '1';
        let maxGoals = 4;
        if (diff > 15) maxGoals = 5;
        if (diff > 25) maxGoals = 6;
        homeGoals = randomInt(diff > 25 ? 2 : 1, maxGoals);
        awayGoals = randomInt(0, homeGoals - 1);
      } else if (roll < m.probabilities.home + m.probabilities.draw) {
        outcome = 'x';
        homeGoals = randomInt(0, 3);
        awayGoals = homeGoals;
      } else {
        outcome = '2';
        let maxGoals = 4;
        if (diff < -15) maxGoals = 5;
        if (diff < -25) maxGoals = 6;
        awayGoals = randomInt(diff < -25 ? 2 : 1, maxGoals);
        homeGoals = randomInt(0, awayGoals - 1);
      }

      const matchWon = m.type === outcome;
      if (!matchWon) {
        ticketWon = false;
      }

      matchResults.push({
        ...m,
        homeGoals,
        awayGoals,
        outcome,
        matchWon
      });
    }

    let net = 0;
    if (ticketWon) {
      const tax = Math.round(potentialWin * 0.15);
      const payout = potentialWin - tax;
      net = payout - totalStake;
      user.balance += payout;
    } else {
      net = -totalStake;
    }

    const xpResult = recordGame(user, net, 25, inventory);
    refreshBadges(user, inventory);

    return {
      ticketWon,
      net,
      matchResults,
      balance: user.balance,
      xpResult
    };
  });

  let replyText = `⚽ **PRZERWANY KUPON MULTI-OBSTAWIENIA ODZYSKANY** ⚽\n\n`;
  outcomeResult.matchResults.forEach((m) => {
    const typeLabels = { '1': m.home, 'x': 'Remis', '2': m.away };
    replyText += `• **Mecz ${m.matchIdx + 1}**: **${m.home}** 🆚 **${m.away}**\n` +
                 `  Wynik: **${m.homeGoals} - ${m.awayGoals}** (Typ: **${typeLabels[m.type]}** | ${m.matchWon ? '✅ Trafiony' : '❌ Nietrafiony'})\n\n`;
  });

  if (outcomeResult.ticketWon) {
    const tax = Math.round(potentialWin * 0.15);
    replyText += `🎉 **KUPON WYGRANY!**\nZysk netto: **+${formatCurrency(outcomeResult.net)}** (Wygrana brutto: ${formatCurrency(potentialWin)}, podatek 15%: -${formatCurrency(tax)})\n`;
  } else {
    replyText += `💀 **KUPON PRZEGRANY.**\nStrata: **-${formatCurrency(Math.abs(outcomeResult.net))}**\n`;
  }

  replyText += `💰 Twój balans: **${formatCurrency(outcomeResult.balance)}**`;

  if (outcomeResult.xpResult && outcomeResult.xpResult.leveledUp) {
    replyText += `\n🎉 **AWANS!** Awansowałeś na **poziom ${outcomeResult.xpResult.newLevel}**!`;
    if (outcomeResult.xpResult.milestonesGained && outcomeResult.xpResult.milestonesGained.length > 0) {
      const { getMilestoneRewardDescription } = require('./economy');
      for (const lvl of outcomeResult.xpResult.milestonesGained) {
        replyText += `\n🎁 Otrzymałeś nagrodę za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
      }
    }
  }

  await new Promise((resolve, reject) => {
    api.sendMessage(replyText, threadId, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

module.exports = {
  addActiveBet,
  removeActiveBet,
  resolvePendingBets
};
