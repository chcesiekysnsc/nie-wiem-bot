const fs = require('fs');
const path = require('path');
const { withData, createUser, DATA_DIR } = require('./storage');
const { formatCurrency, refreshBadges, ensureInventoryRecord, randomInt, recordGame } = require('./economy');

const BETS_FILE = path.join(DATA_DIR, 'active_bets.json');

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

  const homeCards = [];
  const awayCards = [];

  const homeYellowed = new Set();
  const awayYellowed = new Set();
  const homeRedded = new Set();
  const awayRedded = new Set();

  let homeDebuff = 0;
  let awayDebuff = 0;

  function rollCardsForTeam(teamName, halfNum, cardsArray, yellowedSet, reddedSet, isHome) {
    const numCards = Math.random() < 0.35 ? (Math.random() < 0.2 ? 2 : 1) : 0;
    for (let i = 0; i < numCards; i++) {
      const { PLAYERS_DB } = require('./players');
      const allPlayers = PLAYERS_DB[teamName] || [];
      const eligiblePlayers = allPlayers.filter(p => !reddedSet.has(p));
      if (eligiblePlayers.length === 0) continue;

      const player = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
      const min = halfNum === 1 ? randomInt(1, 45) : randomInt(46, 90);

      if (yellowedSet.has(player)) {
        reddedSet.add(player);
        cardsArray.push({ player, minute: min, secondYellow: true });
        if (isHome) {
          homeDebuff = 3;
        } else {
          awayDebuff = 3;
        }
      } else {
        yellowedSet.add(player);
        cardsArray.push({ player, minute: min, secondYellow: false });
      }
    }
  }

  // 1. Roll 1st half cards
  rollCardsForTeam(homeName, 1, homeCards, homeYellowed, homeRedded, true);
  rollCardsForTeam(awayName, 1, awayCards, awayYellowed, awayRedded, false);

  // 1st half goals
  const half1 = simulateHalfResult(homeStr, awayStr);

  // 2nd half event check (injury or direct red card)
  const event = rollHalfTimeEvent(homeName, awayName);
  
  if (event.occurred) {
    if (event.team === 'home') {
      homeDebuff = 3;
      if (event.type === 'red_card') {
        const { PLAYERS_DB } = require('./players');
        const homePlayers = PLAYERS_DB[homeName] || [];
        const eligible = homePlayers.filter(p => !homeRedded.has(p));
        if (eligible.length > 0) {
          const p = eligible[Math.floor(Math.random() * eligible.length)];
          homeRedded.add(p);
          homeCards.push({ player: p, minute: 60, directRed: true });
          event.text = `🟥 **${homeName}**: Czerwona kartka dla **${p}** za brutalny wślizg od tyłu! Grają w dziesiątkę.`;
        }
      }
    } else {
      awayDebuff = 3;
      if (event.type === 'red_card') {
        const { PLAYERS_DB } = require('./players');
        const awayPlayers = PLAYERS_DB[awayName] || [];
        const eligible = awayPlayers.filter(p => !awayRedded.has(p));
        if (eligible.length > 0) {
          const p = eligible[Math.floor(Math.random() * eligible.length)];
          awayRedded.add(p);
          awayCards.push({ player: p, minute: 60, directRed: true });
          event.text = `🟥 **${awayName}**: Czerwona kartka dla **${p}** za brutalny wślizg od tyłu! Grają w dziesiątkę.`;
        }
      }
    }
  }

  const modifiedHomeStr = Math.max(1, homeStr - homeDebuff);
  const modifiedAwayStr = Math.max(1, awayStr - awayDebuff);

  // 2nd half goals
  const half2 = simulateHalfResult(modifiedHomeStr, modifiedAwayStr);

  // Roll 2nd half cards
  rollCardsForTeam(homeName, 2, homeCards, homeYellowed, homeRedded, true);
  rollCardsForTeam(awayName, 2, awayCards, awayYellowed, awayRedded, false);

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
    homeCards,
    awayCards,
    event,
    homeGoals2: half2.homeGoals,
    awayGoals2: half2.awayGoals,
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

  const allHomeCards = sim.homeCards || [];
  const allAwayCards = sim.awayCards || [];

  if (allHomeCards.length > 0 || allAwayCards.length > 0) {
    replyText += `🎴 **Podsumowanie kartek:**\n`;
    allHomeCards.forEach(c => {
      if (c.directRed) {
        replyText += `• 🟥 ${c.player} (${match.home}) ${c.minute}' (Bezpośrednia czerwona)\n`;
      } else if (c.secondYellow) {
        replyText += `• 🟨🟥 ${c.player} (${match.home}) ${c.minute}' (Druga żółta)\n`;
      } else {
        replyText += `• 🟨 ${c.player} (${match.home}) ${c.minute}'\n`;
      }
    });
    allAwayCards.forEach(c => {
      if (c.directRed) {
        replyText += `• 🟥 ${c.player} (${match.away}) ${c.minute}' (Bezpośrednia czerwona)\n`;
      } else if (c.secondYellow) {
        replyText += `• 🟨🟥 ${c.player} (${match.away}) ${c.minute}' (Druga żółta)\n`;
      } else {
        replyText += `• 🟨 ${c.player} (${match.away}) ${c.minute}'\n`;
      }
    });
    replyText += `\n`;
  }

  if (sim.event && sim.event.occurred) {
    replyText += `⚡ **Zdarzenie z meczu:**\n${sim.event.text}\n\n`;
  }

  if (outcomeResult.won) {
    replyText += `🎉 **GRATULACJE! TWÓJ KUPON JEST WYGRANY!** 🎉\n` +
                 `🏆 Wygrana (bez podatku): **${formatCurrency(outcomeResult.payout)}**\n` +
                 `💸 Pobrany podatek (15%): **${formatCurrency(outcomeResult.tax)}**\n` +
                 `💰 Czysty zysk: **+${formatCurrency(outcomeResult.net)}**\n\n`;

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

    const allHomeCards = sim.homeCards || [];
    const allAwayCards = sim.awayCards || [];
    if (allHomeCards.length > 0 || allAwayCards.length > 0) {
      replyText += `  🎴 Kartki: `;
      const cardStrings = [];
      allHomeCards.forEach(c => {
        if (c.directRed) cardStrings.push(`🟥 ${c.player} (${m.home}) ${c.minute}' (Czerwona)`);
        else if (c.secondYellow) cardStrings.push(`🟨🟥 ${c.player} (${m.home}) ${c.minute}' (2x Żółta)`);
        else cardStrings.push(`🟨 ${c.player} (${m.home}) ${c.minute}'`);
      });
      allAwayCards.forEach(c => {
        if (c.directRed) cardStrings.push(`🟥 ${c.player} (${m.away}) ${c.minute}' (Czerwona)`);
        else if (c.secondYellow) cardStrings.push(`🟨🟥 ${c.player} (${m.away}) ${c.minute}' (2x Żółta)`);
        else cardStrings.push(`🟨 ${c.player} (${m.away}) ${c.minute}'`);
      });
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
    replyText += `🎉 **GRATULACJE! TWÓJ KUPON JEST WYGRANY!** 🎉\n` +
                 `🏆 Wygrana (bez podatku): **${formatCurrency(payoutApplied)}**\n` +
                 `💸 Pobrany podatek (15%): **${formatCurrency(tax)}**\n` +
                 `💰 Czysty zysk: **+${formatCurrency(outcomeResult.net)}**\n\n`;

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
