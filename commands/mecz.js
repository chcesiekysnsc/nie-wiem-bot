const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord, resolveAmount, randomInt } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const TEAMS = {
  // === TOP 100 EUROPEJSKICH KLUBÓW WG UEFA 2025/2026 ===
  'Bayern Monachium': 94,
  'Real Madryt': 94,
  'Paris Saint-Germain': 92,
  'Liverpool FC': 92,
  'Inter Mediolan': 91,
  'Manchester City': 91,
  'Arsenal FC': 90,
  'FC Barcelona': 89,
  'Bayer Leverkusen': 88,
  'Atletico Madryt': 88,
  'Borussia Dortmund': 87,
  'Chelsea FC': 87,
  'AS Roma': 86,
  'SL Benfica': 85,
  'Sporting CP': 84,
  'Atalanta Bergamo': 84,
  'Aston Villa': 84,
  'Eintracht Frankfurt': 84,
  'Tottenham Hotspur': 83,
  'FC Porto': 83,
  'Manchester United': 83,
  'Fiorentina': 82,
  'Club Brugge': 82,
  'Real Betis': 82,
  'Juventus FC': 81,
  'PSV Eindhoven': 81,
  'Feyenoord Rotterdam': 81,
  'West Ham United': 81,
  'Lille OSC': 81,
  'AC Milan': 80,
  'Olympique Lyon': 80,
  'FK Bodø/Glimt': 80,
  'SC Braga': 80,
  'SSC Napoli': 80,
  'AZ Alkmaar': 79,
  'Olympiakos Pireus': 79,
  'RB Lipsk': 79,
  'Rangers FC': 79,
  'Villarreal CF': 79,
  'Lazio Rzym': 79,
  'Ajax Amsterdam': 79,
  'Fenerbahce SK': 78,
  'Real Sociedad': 78,
  'SC Freiburg': 78,
  'Szachtar Donieck': 78,
  'AS Monaco': 78,
  'FC Kopenhaga': 78,
  'Olympique Marsylia': 78,
  'Galatasaray SK': 77,
  'Ferencváros': 77,
  'Viktoria Pilzno': 77,
  'FC Midtjylland': 77,
  'PAOK Saloniki': 77,
  'Union Saint-Gilloise': 77,
  'Crvena Zvezda': 76,
  'Dinamo Zagrzeb': 76,
  'RB Salzburg': 76,
  'Celtic FC': 76,
  'Slavia Praga': 76,
  'Karabach FK': 76,
  'KAA Gent': 75,
  'Sevilla FC': 75,
  'Athletic Bilbao': 75,
  'Sparta Praga': 75,
  'Slovan Bratysława': 75,
  'Stade Rennais': 75,
  'FC Basel': 75,
  'Legia Warszawa': 74,
  'Maccabi Tel Awiw': 74,
  'Djurgården': 74,
  'Bologna FC': 74,
  'Anderlecht Bruksela': 74,
  'Newcastle United': 74,
  'Rapid Wiedeń': 74,
  'BSC Young Boys': 74,
  'Panathinaikos AO': 74,
  'KRC Genk': 74,
  'Łudogorec Razgrad': 74,
  'Sturm Graz': 74,
  'VfB Stuttgart': 74,
  'Lech Poznań': 73,
  'FCSB': 73,
  'Pafos': 73,
  'AEK Ateny': 73,
  'Nottingham Forest': 73,
  'Crystal Palace': 73,
  'Brighton & Hove Albion': 73,
  'Leicester City': 73,
  'NK Celje': 73,
  'Union Berlin': 73,
  'Raków Częstochowa': 72,
  'Rayo Vallecano': 72,
  'Jagiellonia Białystok': 72,
  'Partizan Belgrad': 72,
  'Molde FK': 72,
  'RC Strasbourg': 72,
  'Omonia Nikozja': 72,
  'FC Lugano': 72,
  'LASK Linz': 72,
  'AEK Larnaka': 71,

  // === TOP 5 POLSKICH KLUBÓW (Dla zachowania spójności, jeśli któregoś brakowało) ===
  'Pogoń Szczecin': 68
};

function generateMatch() {
  const teamNames = Object.keys(TEAMS);
  const homeIdx = randomInt(0, teamNames.length - 1);
  let awayIdx = randomInt(0, teamNames.length - 1);
  while (awayIdx === homeIdx) {
    awayIdx = randomInt(0, teamNames.length - 1);
  }

  const home = teamNames[homeIdx];
  const away = teamNames[awayIdx];

  const baseHomeStrength = TEAMS[home];
  const baseAwayStrength = TEAMS[away];

  // Dynamiczna forma (-4 do +4)
  const homeForm = randomInt(-4, 4);
  const awayForm = randomInt(-4, 4);

  // Przewaga własnego boiska (+3)
  const homeStrength = baseHomeStrength + homeForm + 3;
  const awayStrength = baseAwayStrength + awayForm;

  const diff = homeStrength - awayStrength;

  // Krzywa logistyczna do podziału prawdopodobieństwa
  const exponent = diff / 10;
  const ratio = 1 / (1 + Math.exp(-exponent));

  // Prawdopodobieństwo remisu: maleje gdy rośnie różnica sił
  const pDraw = 0.26 * (1 - Math.abs(ratio - 0.5) * 0.8);

  // Podział pozostałego prawdopodobieństwa
  const pHome = (1 - pDraw) * ratio;
  const pAway = (1 - pDraw) * (1 - ratio);

  // Obliczanie kursów z marżą kasyna (ok. 8%)
  const margin = 0.92;
  const oddsHome = parseFloat(Math.max(1.10, margin / pHome).toFixed(2));
  const oddsAway = parseFloat(Math.max(1.10, margin / pAway).toFixed(2));
  const oddsDraw = parseFloat(Math.max(1.10, margin / pDraw).toFixed(2));

  return {
    home,
    away,
    diff,
    odds: {
      1: oddsHome,
      x: oddsDraw,
      2: oddsAway
    },
    probabilities: {
      home: pHome,
      draw: pDraw,
      away: pAway
    }
  };
}

module.exports = {
  name: 'mecz',
  aliases: ['betmecz', 'spotkanie'],
  TEAMS,
  generateMatch,
  async execute(client, message, args) {
    if (!client.activeMatches) {
      client.activeMatches = new Map();
    }

    const userId = message.author.id;

    // 1. Sprawdzenie oferty (wywołanie !mecz bez argumentów)
    if (args.length === 0) {
      let match = client.activeMatches.get(userId);
      let isNew = false;
      if (!match) {
        match = generateMatch();
        client.activeMatches.set(userId, match);
        isNew = true;
      }

      const response = 
        `⚽ **PROPOZYCJA MECZU** ⚽\n` +
        `🏠 **${match.home}** 🆚 **${match.away}** ✈️\n\n` +
        `📈 **Kursy bukmacherskie (1 / X / 2):**\n` +
        `• 1️⃣ Wygrana (${match.home}): **${match.odds[1]}**\n` +
        `• ❌ Remis: **${match.odds['x']}**\n` +
        `• 2️⃣ Wygrana (${match.away}): **${match.odds[2]}**\n\n` +
        `👉 Aby obstawić ten mecz, wpisz: **!mecz <stawka> <1/X/2>** (np. **!mecz 1000 1**).\n` +
        `💡 *${isNew ? 'Wygenerowano nową ofertę.' : 'Masz już aktywną ofertę meczu. Musisz ją obstawić przed wygenerowaniem kolejnej.'}*`;

      await message.reply(response);
      return;
    }

    // 2. Obstawił mecz: !mecz <stawka> <typ> lub !mecz <typ> <stawka>
    const arg0 = args[0];
    const arg1 = args[1];

    let rawBet = null;
    let rawType = null;

    // Ustalanie który argument to typ (1, x, 2)
    const typeRegex = /^(1|x|2)$/i;
    const isArg0Type = typeRegex.test(arg0);
    const isArg1Type = typeRegex.test(arg1);

    if (isArg0Type && !isArg1Type) {
      rawType = arg0.toLowerCase();
      rawBet = arg1;
    } else if (isArg1Type && !isArg0Type) {
      rawType = arg1.toLowerCase();
      rawBet = arg0;
    } else {
      // Fallback
      rawBet = arg0;
      rawType = String(arg1 || '').toLowerCase();
    }

    if (!rawBet || !typeRegex.test(rawType)) {
      await message.reply('❌ Niepoprawne użycie komendy.\n👉 Użyj: **!mecz <stawka> <1/X/2>** lub **!mecz** (aby sprawdzić ofertę).');
      return;
    }

    // Pobierz ofertę dla użytkownika (jeśli brak, zwracamy błąd)
    let match = client.activeMatches.get(userId);
    if (!match) {
      await message.reply('❌ Nie masz aktywnej propozycji meczu.\n👉 Wpisz najpierw **!mecz**, aby wygenerować ofertę.');
      return;
    }

    if (!client.meczInProgress) {
      client.meczInProgress = new Set();
    }
    if (client.meczInProgress.has(userId)) {
      await message.reply('❌ Twój poprzedni zakład jest jeszcze symulowany! Poczekaj na wynik.');
      return;
    }

    client.meczInProgress.add(userId);

    // Wyczyszczenie oferty
    client.activeMatches.delete(userId);

    const setupResult = await withData(store => {
      const user = createUser(userId, store.users);
      const bet = resolveAmount(rawBet, user.balance);

      if (!bet || bet <= 0) {
        return { error: '❌ Podaj poprawną kwotę zakładu.' };
      }

      if (bet > user.balance) {
        return { error: `❌ Nie masz tylu monet. Posiadasz: ${formatCurrency(user.balance)}` };
      }

      // Potrącamy stawkę z góry
      user.balance -= bet;
      return { bet, newBalance: user.balance };
    });

    if (setupResult.error) {
      client.meczInProgress.delete(userId);
      await message.reply(setupResult.error);
      return;
    }

    const bet = setupResult.bet;
    const typeLabels = {
      1: match.home,
      x: 'Remis',
      2: match.away
    };
    const odds = match.odds[rawType];
    const potentialWin = Math.round(bet * odds);
    const tax = Math.round(potentialWin * 0.15);
    const payout = potentialWin - tax;

    // Zapisz aktywny zakład do pliku (ochrona przed restartem bota)
    const { addActiveBet, removeActiveBet } = require('../utils/bets');
    addActiveBet(userId, {
      threadId: message.threadID,
      bet,
      rawType,
      match,
      isMulti: false
    });

    await message.reply(
      `🎟️ **KUPON POSTAWIONY!**\n` +
      `Mecz: **${match.home}** vs **${match.away}**\n` +
      `Twój typ: **${typeLabels[rawType]}** (kurs: **${odds}**)\n` +
      `💰 Stawka: **${formatCurrency(bet)}**\n` +
      `🏆 Wygrana (bez podatku): **${formatCurrency(payout)}**\n` +
      `💸 Pobrany podatek (15%): **${formatCurrency(tax)}**\n\n` +
      `⏱️ *Trwa symulacja meczu... (wynik za 15 sekund)*`
    );

    setTimeout(async () => {
      try {
        // Usuń aktywny zakład po rozpoczęciu rozliczania
        removeActiveBet(userId);

        const result = await withData(store => {
          const user = createUser(userId, store.users);
          const inventory = ensureInventoryRecord(store.inventory, userId);

          // Symulacja wyniku meczu
          const roll = Math.random();
          let outcome = 'x'; // '1', 'x', '2'
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
          let net = 0;
          let taxApplied = 0;
          let payoutApplied = 0;

          if (won) {
            taxApplied = Math.round(potentialWin * 0.15);
            payoutApplied = potentialWin - taxApplied;
            net = payoutApplied - bet;
            user.balance += payoutApplied; // Dodajemy wygraną po odliczeniu podatku
          } else {
            net = -bet;
            // Nic nie robimy, stawka przepadła
          }

          const { recordGame } = require('../utils/economy');
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

        let replyText = 
          `⚽ **ZAKŁAD SPORTOWY** ⚽\n` +
          `Mecz: **${match.home}** vs **${match.away}**\n` +
          `Twój typ: **${typeLabels[rawType]}** (kurs: **${odds}**)\n\n` +
          `🏁 **Wynik meczu: ${result.homeGoals} - ${result.awayGoals}**\n\n`;

        if (result.won) {
          const taxApplied = Math.round(potentialWin * 0.15);
          const payoutApplied = potentialWin - taxApplied;
          replyText += `🎉 Gratulacje! Twój kupon jest **WYGRANY**! Czysty zysk: **+${formatCurrency(result.net)}** (Wygrana bez podatku: ${formatCurrency(payoutApplied)}, pobrany podatek: -${formatCurrency(taxApplied)})\n`;

          // Powiadomienie na grupę administratorską, jeśli kurs > 20
          if (odds > 20) {
            try {
              const adminGroupId = config.adminGroupId || '5277347745703557';
              const userName = (client.userNames && client.userNames.get(userId)) || `Użytkownik_${userId.slice(-6)}`;
              const notifyMsg = `🔥 **DUŻA WYGRANA W MECZACH!** 🔥\n` +
                                `👤 Gracz: **${userName}** (ID: \`${userId}\`)\n` +
                                `🏆 Trafiony kurs: **${odds}**\n` +
                                `💰 Stawka: **${formatCurrency(bet)}**\n` +
                                `💸 Wygrana (bez podatku): **${formatCurrency(payoutApplied)}**`;
              client.api.sendMessage(notifyMsg, adminGroupId);
            } catch (err) {
              console.error('[MECZ] Failed to send admin notification:', err);
            }
          }
        } else {
          replyText += `💀 Niestety, Twój kupon jest **PRZEGRANY**. Strata: **-${formatCurrency(Math.abs(result.net))}**\n`;
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
        console.error('Error resolving match bet:', err);
      } finally {
        client.meczInProgress.delete(userId);
      }
    }, 15000);
  }
};
