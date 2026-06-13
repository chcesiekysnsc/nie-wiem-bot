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

const { getRandomPlayer } = require('./players');

function simulateHalfResult(homeStr, awayStr) {
  const diff = homeStr - awayStr;
  const exponent = diff / 10;
  const ratio = 1 / (1 + Math.exp(-exponent));
  
  // single half draws are more common
  const pDraw = 0.38 * (1 - Math.abs(ratio - 0.5) * 0.8);
  const pHome = (1 - pDraw) * ratio;
  const pAway = (1 - pDraw) * (1 - ratio);

  const roll = Math.random();
  let homeGoals = 0;
  let awayGoals = 0;
  if (roll < pHome) {
    homeGoals = randomInt(1, 3);
    awayGoals = randomInt(0, homeGoals - 1);
  } else if (roll < pHome + pDraw) {
    homeGoals = randomInt(0, 1);
    awayGoals = homeGoals;
  } else {
    awayGoals = randomInt(1, 3);
    homeGoals = randomInt(0, awayGoals - 1);
  }
  return { homeGoals, awayGoals };
}

function rollYellowCardsForHalf(teamName, halfNum) {
  const cards = [];
  const numCards = Math.random() < 0.35 ? (Math.random() < 0.2 ? 2 : 1) : 0;
  for (let i = 0; i < numCards; i++) {
    const player = getRandomPlayer(teamName);
    const min = halfNum === 1 ? randomInt(1, 45) : randomInt(46, 90);
    cards.push({ player, minute: min });
  }
  cards.sort((a, b) => a.minute - b.minute);
  return cards;
}

function rollHalfTimeEvent(homeName, awayName) {
  if (Math.random() < 0.05) {
    const isHome = Math.random() < 0.5;
    const teamName = isHome ? homeName : awayName;
    const teamKey = isHome ? 'home' : 'away';
    const isInjury = Math.random() < 0.5;

    const injuries = [
      `🚑 **${teamName}**: Kontuzja kluczowego napastnika! Musi zejść z boiska.`,
      `🚑 **${teamName}**: Kontuzja podstawowego pomocnika! Sztab medyczny interweniuje.`,
      `🚑 **${teamName}**: Kontuzja bramkarza! Zostaje zastąpiony rezerwowym.`,
      `🚑 **${teamName}**: Uraz mięśniowy lidera defensywy! Gra ze sporym dyskomfortem.`
    ];

    const redCards = [
      `🟥 **${teamName}**: Czerwona kartka za brutalny wślizg od tyłu! Grają w dziesiątkę.`,
      `🟥 **${teamName}**: Druga żółta i w konsekwencji czerwona kartka dla środkowego obrońcy!`,
      `🟥 **${teamName}**: Czerwona kartka za niesportowe zachowanie i kłótnie z sędzią!`,
      `🟥 **${teamName}**: Wykluczenie z gry po analizie VAR za uderzenie rywala bez piłki!`
    ];

    const list = isInjury ? injuries : redCards;
    const text = list[randomInt(0, list.length - 1)];

    return {
      occurred: true,
      team: teamKey,
      teamName,
      text,
      type: isInjury ? 'injury' : 'red_card'
    };
  }

  return { occurred: false };
}

function simulateFullMatch(match) {
  const homeStr = match.homeStrength || 80;
  const awayStr = match.awayStrength || 80;
  const homeName = match.home;
  const awayName = match.away;

  // 1st half goals
  const half1 = simulateHalfResult(homeStr, awayStr);

  // 1st half yellow cards
  const homeYellows1 = rollYellowCardsForHalf(homeName, 1);
  const awayYellows1 = rollYellowCardsForHalf(awayName, 1);

  // 2nd half event check
  const event = rollHalfTimeEvent(homeName, awayName);

  let modifiedHomeStr = homeStr;
  let modifiedAwayStr = awayStr;
  if (event.occurred) {
    if (event.team === 'home') {
      modifiedHomeStr = Math.max(1, homeStr - 3);
    } else {
      modifiedAwayStr = Math.max(1, awayStr - 3);
    }
  }

  // 2nd half goals
  const half2 = simulateHalfResult(modifiedHomeStr, modifiedAwayStr);

  // 2nd half yellow cards
  const homeYellows2 = rollYellowCardsForHalf(homeName, 2);
  const awayYellows2 = rollYellowCardsForHalf(awayName, 2);

  const finalHomeGoals = half1.homeGoals + half2.homeGoals;
  const finalAwayGoals = half1.awayGoals + half2.awayGoals;

  let outcome = 'x';
  if (finalHomeGoals > finalAwayGoals) {
    outcome = '1';
  } else if (finalHomeGoals < finalAwayGoals) {
    outcome = '2';
  }

  return {
    homeGoals1: half1.homeGoals,
    awayGoals1: half1.awayGoals,
    homeYellows1,
    awayYellows1,
    event,
    homeGoals2: half2.homeGoals,
    awayGoals2: half2.awayGoals,
    homeYellows2,
    awayYellows2,
    finalHomeGoals,
    finalAwayGoals,
    outcome
  };
}

async function resolveSingleMatchBet(api, userId, betData) {
  const { threadId, bet, rawType, match } = betData;
  const sim = betData.simulation || simulateFullMatch(match);

  const outcomeResult = await withData(store => {
    const user = createUser(userId, store.users);
    const inventory = ensureInventoryRecord(store.inventory, userId);

    const won = rawType === sim.outcome;
    const odds = match.odds[rawType];
    const potentialWin = Math.round(bet * odds);
    let net = 0;
    let tax = 0;
    let payout = 0;

    if (won) {
      tax = Math.round(potentialWin * 0.15);
      payout = potentialWin - tax;
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
      balance: user.balance,
      xpResult,
      potentialWin,
      tax,
      payout
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
    `🏁 **Wynik meczu: ${sim.finalHomeGoals} - ${sim.finalAwayGoals}** (do przerwy: ${sim.homeGoals1} - ${sim.awayGoals1})\n\n`;

  const allHomeYellows = [...sim.homeYellows1, ...sim.homeYellows2];
  const allAwayYellows = [...sim.awayYellows1, ...sim.awayYellows2];
  if (allHomeYellows.length > 0 || allAwayYellows.length > 0) {
    replyText += `🎴 **Żółte kartki:**\n`;
    allHomeYellows.forEach(c => {
      replyText += `• 🟨 ${c.player} (${match.home}) ${c.minute}'\n`;
    });
    allAwayYellows.forEach(c => {
      replyText += `• 🟨 ${c.player} (${match.away}) ${c.minute}'\n`;
    });
    replyText += `\n`;
  }

  if (sim.event && sim.event.occurred) {
    replyText += `⚡ **Zdarzenie z meczu:**\n${sim.event.text}\n\n`;
  }

  if (outcomeResult.won) {
    replyText += `🎉 Gratulacje! Twój kupon jest **WYGRANY**! Czysty zysk: **+${formatCurrency(outcomeResult.net)}** (Wygrana bez podatku: ${formatCurrency(outcomeResult.payout)}, pobrany podatek: -${formatCurrency(outcomeResult.tax)})\n`;

    // Powiadomienie na grupę administratorską, jeśli kurs > 20
    if (odds > 20) {
      try {
        const config = require('../config/config');
        const adminGroupId = config.adminGroupId || '5277347745703557';
        const userName = `Użytkownik_${userId.slice(-6)}`;
        const notifyMsg = `🔥 **DUŻA WYGRANA W MECZACH (ODZYSKANY ZAKŁAD)!** 🔥\n` +
                          `👤 Gracz: **${userName}** (ID: \`${userId}\`)\n` +
                          `🏆 Trafiony kurs: **${odds}**\n` +
                          `💰 Stawka: **${formatCurrency(bet)}**\n` +
                          `💸 Wygrana (bez podatku): **${formatCurrency(outcomeResult.payout)}**`;
        api.sendMessage(notifyMsg, adminGroupId);
      } catch (err) {
        console.error('[BETS] Failed to send admin notification:', err);
      }
    }
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
  const sims = betData.simulations || matchDetails.map(m => simulateFullMatch(m));

  const outcomeResult = await withData(store => {
    const user = createUser(userId, store.users);
    const inventory = ensureInventoryRecord(store.inventory, userId);

    let ticketWon = true;
    const matchResults = [];

    for (let i = 0; i < matchDetails.length; i++) {
      const m = matchDetails[i];
      const sim = sims[i];
      const matchWon = m.type === sim.outcome;
      if (!matchWon) {
        ticketWon = false;
      }
      matchResults.push({
        ...m,
        sim,
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
  outcomeResult.matchResults.forEach((m, idx) => {
    const typeLabels = { '1': m.home, 'x': 'Remis', '2': m.away };
    const sim = sims[idx];
    replyText += `• **Mecz ${m.matchIdx + 1}**: **${m.home}** 🆚 **${m.away}**\n` +
                 `  Wynik: **${sim.finalHomeGoals} - ${sim.finalAwayGoals}** (do przerwy: ${sim.homeGoals1} - ${sim.awayGoals1} | Typ: **${typeLabels[m.type]}** | ${m.matchWon ? '✅ Trafiony' : '❌ Nietrafiony'})\n`;

    const allHomeYellows = [...sim.homeYellows1, ...sim.homeYellows2];
    const allAwayYellows = [...sim.awayYellows1, ...sim.awayYellows2];
    if (allHomeYellows.length > 0 || allAwayYellows.length > 0) {
      replyText += `  🎴 Żółte kartki: `;
      const cardStrings = [];
      allHomeYellows.forEach(c => cardStrings.push(`🟨 ${c.player} (${m.home}) ${c.minute}'`));
      allAwayYellows.forEach(c => cardStrings.push(`🟨 ${c.player} (${m.away}) ${c.minute}'`));
      replyText += cardStrings.join(', ') + '\n';
    }

    if (sim.event && sim.event.occurred) {
      replyText += `  ⚡ Zdarzenie: ${sim.event.text}\n`;
    }
    replyText += `\n`;
  });

  if (outcomeResult.ticketWon) {
    const tax = Math.round(potentialWin * 0.15);
    const payoutApplied = potentialWin - tax;
    replyText += `🎉 **KUPON WYGRANY!**\nCzysty zysk: **+${formatCurrency(outcomeResult.net)}** (Wygrana bez podatku: ${formatCurrency(payoutApplied)}, pobrany podatek: -${formatCurrency(tax)})\n`;

    // Powiadomienie na grupę administratorską, jeśli kurs > 20
    if (combinedOdds > 20) {
      try {
        const config = require('../config/config');
        const adminGroupId = config.adminGroupId || '5277347745703557';
        const userName = `Użytkownik_${userId.slice(-6)}`;
        const notifyMsg = `🔥 **DUŻA WYGRANA W MULTI-MECZU (ODZYSKANY KUPON)!** 🔥\n` +
                          `👤 Gracz: **${userName}** (ID: \`${userId}\`)\n` +
                          `🏆 Trafiony łączny kurs: **${combinedOdds}**\n` +
                          `💰 Stawka: **${formatCurrency(totalStake)}**\n` +
                          `💸 Wygrana (bez podatku): **${formatCurrency(payoutApplied)}**`;
        api.sendMessage(notifyMsg, adminGroupId);
      } catch (err) {
        console.error('[BETS] Failed to send admin notification:', err);
      }
    }
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
  resolvePendingBets,
  simulateFullMatch,
  simulateHalfResult,
  rollHalfTimeEvent
};
