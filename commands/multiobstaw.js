const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord, resolveAmount, randomInt } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'multiobstaw',
  aliases: ['mo', 'mm'],
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
    let formatType = ''; // 'triplets' or 'pairs'

    if (args.length % 3 === 0 && args.length >= 3) {
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

    client.meczInProgress.add(userId);

    // 4. Walidacja i potrącenie stawki
    const setupResult = await withData(store => {
      const user = createUser(userId, store.users);
      let totalStake = 0;
      let selectionsResolved = [];

      if (formatType === 'pairs') {
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

    // Zapisz aktywny zakład do pliku (ochrona przed restartem bota)
    const { addActiveBet, removeActiveBet } = require('../utils/bets');
    addActiveBet(userId, {
      threadId: message.threadID,
      totalStake,
      combinedOdds,
      potentialWin,
      matchDetails,
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
                `🏆 Potencjalna wygrana: **${formatCurrency(potentialWin)}**\n\n` +
                `⏱️ *Trwa symulacja meczów... (wyniki za 15 sekund)*`;

    await message.reply(setupMsg);

    // 7. Symulacja po 15 sekundach
    setTimeout(async () => {
      try {
        // Usuń aktywny zakład po rozpoczęciu rozliczania
        removeActiveBet(userId);

        const result = await withData(store => {
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
            net = potentialWin - totalStake;
            user.balance += potentialWin; // Dodajemy całą wygraną
          } else {
            net = -totalStake;
            // Nic nie dodajemy, stawka przepadła
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
        let replyText = `⚽ **WYNIKI MULTI-MECZU** ⚽\n\n`;
        result.matchResults.forEach((m) => {
          const typeLabels = { '1': m.home, 'x': 'Remis', '2': m.away };
          replyText += `• **Mecz ${m.matchIdx + 1}**: **${m.home}** 🆚 **${m.away}**\n` +
                       `  Wynik: **${m.homeGoals} - ${m.awayGoals}** (Typ: **${typeLabels[m.type]}** | ${m.matchWon ? '✅ Trafiony' : '❌ Nietrafiony'})\n\n`;
        });

        if (result.ticketWon) {
          replyText += `🎉 **KUPON WYGRANY!**\nZysk netto: **+${formatCurrency(result.net)}**\n`;
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
      }
    }, 15000);
  }
};
