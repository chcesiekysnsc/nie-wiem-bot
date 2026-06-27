const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord, resolveAmount, randomInt } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

function getAutoSelection(match, autoType) {
  const odds = match.odds;
  const oddsArray = [odds['1'], odds['x'], odds['2']];
  
  if (autoType === 'min') {
    const minOdds = Math.min(...oddsArray);
    return Object.keys(odds).find(key => odds[key] === minOdds);
  } else if (autoType === 'mid') {
    const sortedOdds = [...oddsArray].sort((a, b) => a - b);
    const midOdds = sortedOdds[1];
    return Object.keys(odds).find(key => odds[key] === midOdds);
  } else {
    const maxOdds = Math.max(...oddsArray);
    return Object.keys(odds).find(key => odds[key] === maxOdds);
  }
}

module.exports = {
  name: 'multiobstaw',
  aliases: ['mo', 'mm'],
  getAutoSelection,
  async execute(client, message, args) {
    if (!client.activeMultiMatches) {
      client.activeMultiMatches = new Map();
    }
    if (!client.meczInProgress) {
      client.meczInProgress = new Set();
    }

    const userId = message.author.id;

    // 1. Sprawdzenie czy użytkownik ma aktywną ofertę
    const activeMulti = client.activeMultiMatches.get(userId);
    if (!activeMulti) {
      await message.reply('❌ Nie masz aktywnej oferty multi-meczu.\n👉 Wpisz najpierw **!multimecz**, aby wygenerować ofertę.');
      return;
    }

    // 2. Sprawdzenie czy użytkownik ma zakład w toku
    if (client.meczInProgress.has(userId)) {
      await message.reply('❌ Twój poprzedni zakład jest jeszcze symulowany! Poczekaj na wynik.');
      return;
    }

    // 3. Parser argumentów
    let selections = [];
    let totalStakeRaw = null;
    let formatType = ''; // 'triplets', 'pairs', or 'auto'

    // Nowy format: min/mid/max <kwota>
    if (args.length === 2 && ['min', 'mid', 'max'].includes(args[0].toLowerCase())) {
      formatType = 'auto';
      const autoType = args[0].toLowerCase();
      totalStakeRaw = args[1];

      // Oblicz zakłady dla każdego meczu
      for (let i = 0; i < activeMulti.matches.length; i++) {
        const match = activeMulti.matches[i];
        const selectedType = getAutoSelection(match, autoType);
        selections.push({ matchIdx: i, type: selectedType });
      }
    } else if (args.length % 3 === 0 && args.length >= 3) {
      formatType = 'triplets';
      const matchSet = new Set();
      for (let i = 0; i < args.length; i += 3) {
        const matchIdx = parseInt(args[i], 10);
        const type = args[i + 1].toLowerCase();
        const rawStake = args[i + 2];

        if (isNaN(matchIdx) || matchIdx < 1 || matchIdx > activeMulti.matches.length) {
          await message.reply(`❌ Niepoprawny numer meczu: **${args[i]}**.`);
          return;
        }
        if (!/^(1|x|2)$/i.test(type)) {
          await message.reply(`❌ Niepoprawny typ zakładu dla meczu ${matchIdx}: **${args[i + 1]}**. Użyj 1, X lub 2.`);
          return;
        }
        if (matchSet.has(matchIdx)) {
          await message.reply(`❌ Nie możesz obstawić meczu **${matchIdx}** kilkukrotnie na jednym kuponie.`);
          return;
        }
        matchSet.add(matchIdx);
        selections.push({ matchIdx: matchIdx - 1, type, rawStake });
      }
    } else if (args.length % 2 === 1 && args.length >= 3) {
      formatType = 'pairs';
      totalStakeRaw = args[args.length - 1];
      const matchSet = new Set();
      for (let i = 0; i < args.length - 1; i += 2) {
        const matchIdx = parseInt(args[i], 10);
        const type = args[i + 1].toLowerCase();

        if (isNaN(matchIdx) || matchIdx < 1 || matchIdx > activeMulti.matches.length) {
          await message.reply(`❌ Niepoprawny numer meczu: **${args[i]}**.`);
          return;
        }
        if (!/^(1|x|2)$/i.test(type)) {
          await message.reply(`❌ Niepoprawny typ zakładu dla meczu ${matchIdx}: **${args[i + 1]}**. Użyj 1, X lub 2.`);
          return;
        }
        if (matchSet.has(matchIdx)) {
          await message.reply(`❌ Nie możesz obstawić meczu **${matchIdx}** kilkukrotnie na jednym kuponie.`);
          return;
        }
        matchSet.add(matchIdx);
        selections.push({ matchIdx: matchIdx - 1, type });
      }
    } else {
      await message.reply(
        '❌ Niepoprawny format argumentów. Użyj np.:\n' +
        '👉 **!mo 1 1 2 x 1000** (kupon łączony na mecz 1 typ 1 i mecz 2 typ X za stawkę 1000)\n' +
        '👉 **!mo 1 1 1000 2 x 2000** (kupon łączony z osobnymi stawkami na każdy mecz)'
      );
      return;
    }

    if (selections.length !== activeMulti.matches.length) {
      await message.reply(`❌ Twój kupon nie zawiera wszystkich meczów z oferty! Wymagane jest obstawienie wszystkich **${activeMulti.matches.length}** meczów (obstawiłeś: **${selections.length}**).`);
      return;
    }

    client.meczInProgress.add(userId);

    // 4. Walidacja i potrącenie stawki
    const setupResult = await withData(store => {
      const user = createUser(userId, store.users);
      let totalStake = 0;
      let selectionsResolved = [];

      if (formatType === 'auto' || formatType === 'pairs') {
        const resolved = resolveAmount(totalStakeRaw, user.balance);
        if (!resolved || resolved <= 0) {
          return { error: '❌ Podaj poprawną kwotę zakładu.' };
        }
        if (resolved > user.balance) {
          return { error: `❌ Nie masz tylu monet. Posiadasz: ${formatCurrency(user.balance)}` };
        }
        totalStake = resolved;
        user.balance -= totalStake;
        selectionsResolved = selections.map(s => ({ ...s, stake: resolved }));
      } else {
        // triplets format
        let currentBalance = user.balance;
        for (const sel of selections) {
          const resolved = resolveAmount(sel.rawStake, currentBalance);
          if (!resolved || resolved <= 0) {
            return { error: `❌ Podano niepoprawną stawkę dla meczu ${sel.matchIdx + 1}.` };
          }
          if (resolved > currentBalance) {
            return { error: `❌ Brak monet w portfelu na pokrycie wszystkich zakładów (suma przekracza saldo).` };
          }
          currentBalance -= resolved;
          totalStake += resolved;
          selectionsResolved.push({ ...sel, stake: resolved });
        }
        user.balance = currentBalance;
      }

      return { totalStake, selectionsResolved, newBalance: user.balance };
    });

    if (setupResult.error) {
      client.meczInProgress.delete(userId);
      await message.reply(setupResult.error);
      return;
    }

    const { totalStake, selectionsResolved } = setupResult;

    // 5. Obliczenie łącznego kursu (mnożenie kursów)
    let combinedOdds = 1;
    const matchDetails = [];
    for (const sel of selectionsResolved) {
      const match = activeMulti.matches[sel.matchIdx];
      const odds = match.odds[sel.type];
      combinedOdds *= odds;
      matchDetails.push({
        home: match.home,
        away: match.away,
        type: sel.type,
        odds,
        matchIdx: sel.matchIdx,
        probabilities: match.probabilities,
        diff: match.diff
      });
    }

    combinedOdds = parseFloat(combinedOdds.toFixed(2));
    const potentialWin = Math.round(totalStake * combinedOdds);
    const tax = Math.round(potentialWin * 0.15);
    const payout = potentialWin - tax;

    // Zapisz aktywny zakład do pliku (ochrona przed restartem bota)
    const { addActiveBet, removeActiveBet, simulateFullMatch } = require('../utils/bets');
    const simulations = matchDetails.map(m => simulateFullMatch(m));

    addActiveBet(userId, {
      threadId: message.threadID,
      totalStake,
      combinedOdds,
      potentialWin,
      matchDetails,
      simulations,
      isMulti: true
    });

    // Czyszczenie oferty gracza
    client.activeMultiMatches.delete(userId);

    // 6. Wiadomość o postawieniu kuponu
    let setupMsg = `🎟️ **KUPON MULTI-OBSTAWIENIA (AKO) POSTAWIONY!** ⚽\n\n` +
                   `📋 **Wybrane mecze:**\n`;
    matchDetails.forEach((m, idx) => {
      const typeLabels = { '1': m.home, 'x': 'Remis', '2': m.away };
      setupMsg += `• **Mecz ${m.matchIdx + 1}**: **${m.home}** 🆚 **${m.away}** (Typ: **${typeLabels[m.type]}**, kurs: **${m.odds}**)\n`;
    });
    setupMsg += `\n📈 Łączny kurs: **${combinedOdds}**\n` +
                `💰 Łączna stawka: **${formatCurrency(totalStake)}**\n` +
                `🏆 Wygrana (bez podatku): **${formatCurrency(payout)}**\n` +
                `💸 Pobrany podatek (15%): **${formatCurrency(tax)}**\n\n` +
                `⏱️ *Trwa symulacja meczów... (wyniki za 1 minutę)*`;

    await message.reply(setupMsg);

    if (!client.activeMeczTimers) {
      client.activeMeczTimers = new Map();
    }
    const userTimers = [];
    client.activeMeczTimers.set(userId, userTimers);

    // 1. Po 30s: koniec 1. połowy na wszystkich boiskach + żółte kartki
    const t1 = setTimeout(async () => {
      try {
        let halfTimeText = `⚽ **MULTI-OBSTAWIENIE (KONIEC 1. POŁOWY - 45')** ⚽\n\n` +
                           `📋 **Wyniki do przerwy:**\n`;
        matchDetails.forEach((m, idx) => {
          const sim = simulations[idx];
          halfTimeText += `• Mecz ${m.matchIdx + 1}: **${m.home}** 🆚 **${m.away}** -> **${sim.homeGoals1} - ${sim.awayGoals1}**\n`;
          const firstHalfHomeCards = sim.homeCards ? sim.homeCards.filter(c => c.minute <= 45) : [];
          const firstHalfAwayCards = sim.awayCards ? sim.awayCards.filter(c => c.minute <= 45) : [];
          if (firstHalfHomeCards.length > 0 || firstHalfAwayCards.length > 0) {
            halfTimeText += `  🎴 Kartki: `;
            const cardStrings = [];
            firstHalfHomeCards.forEach(c => {
              if (c.secondYellow) cardStrings.push(`🟨🟥 ${c.player} (${m.home}) ${c.minute}' (Druga żółta)`);
              else cardStrings.push(`🟨 ${c.player} (${m.home}) ${c.minute}'`);
            });
            firstHalfAwayCards.forEach(c => {
              if (c.secondYellow) cardStrings.push(`🟨🟥 ${c.player} (${m.away}) ${c.minute}' (Druga żółta)`);
              else cardStrings.push(`🟨 ${c.player} (${m.away}) ${c.minute}'`);
            });
            halfTimeText += cardStrings.join(', ') + '\n';
          }
        });
        halfTimeText += `\n⏱️ *Trwa przerwa i przygotowania do drugiej połowy... (koniec za 30 sekund)*`;
        await message.reply(halfTimeText);
      } catch (err) {
        console.error('Error in 30s multi match timeout:', err);
      }
    }, 30000);
    userTimers.push(t1);

    // 2. Po 45s: zdarzenia z boisk
    const t2 = setTimeout(async () => {
      try {
        let eventText = `⚡ **Wydarzenia na boiskach! (60')** ⚡\n\n`;
        let eventsOccurred = false;
        matchDetails.forEach((m, idx) => {
          const sim = simulations[idx];
          if (sim.event && sim.event.occurred) {
            eventText += `• Mecz ${m.matchIdx + 1} (**${m.home}** vs **${m.away}**):\n  ${sim.event.text}\n  ⚠️ Siła drużyny spada o **-3**!\n\n`;
            eventsOccurred = true;
          }
        });
        if (!eventsOccurred) {
          eventText = `🏃 **Aktualizacja z meczów (60')** 🏃\n` +
                      `Na wszystkich stadionach trwa zacięta walka! Zawodnicy dają z siebie wszystko, a emocje sięgają zenitu.\n\n` +
                      `⏱️ *Mecze zmierzają ku końcowi... (koniec za 15 sekund)*`;
        } else {
          eventText += `⏱️ *Mecze toczą się dalej... (koniec za 15 sekund)*`;
        }
        await message.reply(eventText);
      } catch (err) {
        console.error('Error in 45s multi match timeout:', err);
      }
    }, 45000);
    userTimers.push(t2);

    // 3. Po 60s: koniec meczów + rozliczenie kuponu
    const t3 = setTimeout(async () => {
      try {
        // Usuń aktywny zakład po rozpoczęciu rozliczania
        removeActiveBet(userId);

        const result = await withData(store => {
          const user = createUser(userId, store.users);
          const inventory = ensureInventoryRecord(store.inventory, userId);

          let ticketWon = true;
          const matchResults = [];

          for (let i = 0; i < matchDetails.length; i++) {
            const m = matchDetails[i];
            const sim = simulations[i];
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
          let taxApplied = 0;
          let payoutApplied = 0;
          if (ticketWon) {
            taxApplied = Math.round(potentialWin * 0.15);
            payoutApplied = potentialWin - taxApplied;
            net = payoutApplied - totalStake;
            user.balance += payoutApplied; // Dodajemy wygraną po odliczeniu podatku
          } else {
            net = -totalStake;
          }

          const { recordGame } = require('../utils/economy');
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

        // 8. Wysłanie wyniku kuponu
        let replyText = `⚽ **WYNIKI MULTI-MECZU (KONIEC MECZÓW 90')** ⚽\n\n`;
        result.matchResults.forEach((m) => {
          const typeLabels = { '1': m.home, 'x': 'Remis', '2': m.away };
          const sim = m.sim;
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

        if (result.ticketWon) {
          const taxApplied = Math.round(potentialWin * 0.15);
          const payoutApplied = potentialWin - taxApplied;
          replyText += `🎉 **GRATULACJE! TWÓJ KUPON JEST WYGRANY!** 🎉\n` +
                       `🏆 Wygrana (bez podatku): **${formatCurrency(payoutApplied)}**\n` +
                       `💸 Pobrany podatek (15%): **${formatCurrency(taxApplied)}**\n` +
                       `💰 Czysty zysk: **+${formatCurrency(result.net)}**\n\n`;

          // Powiadomienie na grupę administratorską, jeśli kurs > 20
          if (combinedOdds > 20) {
            try {
              const adminGroupId = config.adminGroupId || '5277347745703557';
              const userName = (client.userNames && client.userNames.get(userId)) || `Użytkownik_${userId.slice(-6)}`;
              const notifyMsg = `🔥 **DUŻA WYGRANA W MULTI-MECZU!** 🔥\n` +
                                `👤 Gracz: **${userName}** (ID: \`${userId}\`)\n` +
                                `🏆 Trafiony łączny kurs: **${combinedOdds}**\n` +
                                `💰 Stawka: **${formatCurrency(totalStake)}**\n` +
                                `💸 Wygrana (bez podatku): **${formatCurrency(payoutApplied)}**`;
              client.api.sendMessage(notifyMsg, adminGroupId);
            } catch (err) {
              console.error('[MULTIOBSTAWIENIE] Failed to send admin notification:', err);
            }
          }

          // Powiadomienie na wszystkie aktywne grupy, jeśli kurs > 80 i wygrana >= 8mln
          if (combinedOdds > 80 && payoutApplied >= 8000000) {
            try {
              const userName = (client.userNames && client.userNames.get(userId)) || `Użytkownik_${userId.slice(-6)}`;
              const globalNotifyMsg = `🎰 **MEGA WYGRANA W MULTI-MECZU!** 🎰\n` +
                                     `👤 Gracz: **${userName}**\n` +
                                     `🏆 Trafiony łączny kurs: **${combinedOdds}**\n` +
                                     `💰 Stawka: **${formatCurrency(totalStake)}**\n` +
                                     `💸 Wygrana (bez podatku): **${formatCurrency(payoutApplied)}**`;
              
              const targets = Array.from(client.activeThreadIds);
              if (targets.length > 0) {
                for (const tId of targets) {
                  client.api.sendMessage(globalNotifyMsg, tId);
                }
              }
            } catch (err) {
              console.error('[MULTIOBSTAWIENIE] Failed to send global notification:', err);
            }
          }
        } else {
          replyText += `💀 **KUPON PRZEGRANY.**\nStrata: **-${formatCurrency(Math.abs(result.net))}**\n`;
        }

        replyText += `💰 Twój balans: **${formatCurrency(result.balance)}**`;

        if (result.xpResult && result.xpResult.leveledUp) {
          replyText += `\n🎉 **AWANS!** Awansowałeś na **poziom ${result.xpResult.newLevel}**!`;
          if (result.xpResult.milestonesGained && result.xpResult.milestonesGained.length > 0) {
            const { getMilestoneRewardDescription } = require('../utils/economy');
            for (const lvl of result.xpResult.milestonesGained) {
              replyText += `\n🎁 Otrzymałeś nagrodę za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
            }
          }
        }

        await message.reply(replyText);
      } catch (err) {
        console.error('Error resolving multi-bet:', err);
      } finally {
        client.meczInProgress.delete(userId);
        if (client.activeMeczTimers) {
          client.activeMeczTimers.delete(userId);
        }
      }
    }, 60000);
    userTimers.push(t3);
  }
};
