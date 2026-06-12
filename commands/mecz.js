const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord, resolveAmount, randomInt } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const TEAMS = {
  'Bayern Monachium': 94,
  'Real Madryt': 94,
  'Inter Mediolan': 91,
  'Liverpool FC': 91,
  'Manchester City': 91,
  'Paris Saint-Germain': 91,
  'Arsenal FC': 89,
  'FC Barcelona': 89,
  'Atletico Madryt': 87,
  'Bayer Leverkusen': 87,
  'Borussia Dortmund': 87,
  'AS Roma': 86,
  'Chelsea FC': 86,
  'SL Benfica': 85,
  'Aston Villa': 84,
  'Atalanta Bergamo': 84,
  'Eintracht Frankfurt': 84,
  'FC Porto': 84,
  'Sporting CP': 84,
  'Tottenham Hotspur': 84,
  'Club Brugge': 83,
  'Fiorentina': 83,
  'Manchester United': 83,
  'Real Betis': 83,
  'Feyenoord Rotterdam': 82,
  'Juventus FC': 82,
  'Lille OSC': 82,
  'PSV Eindhoven': 82,
  'West Ham United': 82,
  'AC Milan': 81,
  'AZ Alkmaar': 81,
  'FK Bodø/Glimt': 81,
  'Olympiakos Pireus': 81,
  'Olympique Lyon': 81,
  'SC Braga': 81,
  'SSC Napoli': 81,
  'Ajax Amsterdam': 80,
  'AS Monaco': 80,
  'Fenerbahce SK': 80,
  'Lazio Rzym': 80,
  'Rangers FC': 80,
  'RB Lipsk': 80,
  'Real Sociedad': 80,
  'SC Freiburg': 80,
  'Szachtar Donieck': 80,
  'Villarreal CF': 80,
  'FC Kopenhaga': 79,
  'Ferencváros': 79,
  'Galatasaray SK': 79,
  'Olympique Marsylia': 79,
  'Viktoria Pilzno': 79,
  'Celtic FC': 78,
  'Crvena Zvezda': 78,
  'Dinamo Zagrzeb': 78,
  'FC Midtjylland': 78,
  'Karabach FK': 78,
  'PAOK Saloniki': 78,
  'RB Salzburg': 78,
  'Slavia Praga': 78,
  'Union Saint-Gilloise': 78,
  'Athletic Bilbao': 77,
  'KAA Gent': 77,
  'Sevilla FC': 77,
  'Slovan Bratysława': 77,
  'Sparta Praga': 77,
  'Anderlecht Bruksela': 76,
  'Bologna FC': 76,
  'BSC Young Boys': 76,
  'Djurgården': 76,
  'FC Basel': 76,
  'Maccabi Tel Awiw': 76,
  'Newcastle United': 76,
  'Panathinaikos AO': 76,
  'Rapid Wiedeń': 76,
  'Stade Rennais': 76,
  'AEK Ateny': 75,
  'FCSB': 75,
  'KRC Genk': 75,
  'Łudogorec Razgrad': 75,
  'Nottingham Forest': 75,
  'Pafos': 75,
  'Sturm Graz': 75,
  'Union Berlin': 75,
  'VfB Stuttgart': 75,
  'AEK Larnaka': 74,
  'Basaksehir FK': 74,
  'Crystal Palace': 74,
  'FC Lugano': 74,
  'LASK Linz': 74,
  'Molde': 74,
  'NK Celje': 74,
  'OGC Nice': 74,
  'Omonia Nikozja': 74,
  'Partizan': 74,
  'Rayo Vallecano': 74,
  'Sheriff Tyraspol': 74,
  'Lech Poznań': 70,
  'Legia Warszawa': 70,
  'Jagiellonia Białystok': 69,
  'Raków Częstochowa': 69,
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
      `🏆 Do wygrania: **${formatCurrency(potentialWin)}**\n\n` +
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

          if (won) {
            net = potentialWin - bet;
            user.balance += potentialWin; // Dodajemy całą wygraną
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
          replyText += `🎉 Gratulacje! Twój kupon jest **WYGRANY**! Zysk: **+${formatCurrency(result.net)}**\n`;
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
