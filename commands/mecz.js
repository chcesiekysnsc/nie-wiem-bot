const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord, resolveAmount, randomInt } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const TEAMS = {
  // === TOP 100 NAJLEPSZYCH KLUBÓW NA ŚWIECIE ===
  // (Oceny bazowe odzwierciedlają realny poziom wg rankingów Opta/UEFA z 2025 roku)
  
  // -- Elita i Top 5 Lig --
  'Real Madryt': 99,
  'Manchester City': 98,
  'Liverpool FC': 96,
  'Arsenal FC': 96,
  'Bayern Monachium': 95,
  'Inter Mediolan': 95,
  'FC Barcelona': 94,
  'Bayer Leverkusen': 94,
  'Paris Saint-Germain': 94,
  'Atletico Madryt': 91,
  'Juventus FC': 90,
  'Borussia Dortmund': 90,
  'Atalanta Bergamo': 89,
  'Chelsea FC': 88,
  'Sporting CP': 88,
  'Aston Villa': 87,
  'AC Milan': 87,
  'SSC Napoli': 87,
  'Manchester United': 86,
  'Tottenham Hotspur': 86,
  'Newcastle United': 85,
  'AS Monaco': 85,
  'Al-Hilal': 85,
  'PSV Eindhoven': 84,
  'FC Porto': 83,
  'SL Benfica': 83,
  'Girona FC': 83,
  'Galatasaray SK': 81,
  'Fenerbahce SK': 81,
  'Real Sociedad': 81,
  'Athletic Bilbao': 81,
  'Lazio Rzym': 81,
  'Lille OSC': 81,
  'Olympique Marsylia': 80,
  'Real Betis': 80,
  'Feyenoord': 80,
  'Brighton & Hove Albion': 80,
  'Eintracht Frankfurt': 80,
  'Fiorentina': 80,
  'Stade Brestois 29': 80,
  'West Ham United': 79,
  'Villarreal CF': 79,
  'Sevilla FC': 79,
  'Olympique Lyon': 79,
  'RC Lens': 79,
  'Bologna FC': 79,
  'SC Freiburg': 79,
  'SC Braga': 79,
  'Szachtar Donieck': 79,
  'Al-Nassr': 79,
  'OGC Nice': 79,
  'Crystal Palace': 78,
  'Stade Rennais': 78,
  'Ajax Amsterdam': 78,
  'Trabzonspor': 78,
  'Olympiakos Pireus': 78,
  'Brentford FC': 77,
  'Wolverhampton Wanderers': 77,
  'Valencia CF': 77,
  'Torino FC': 77,
  'TSG Hoffenheim': 77,
  'Club Brugge': 77,
  'Besiktas JK': 77,
  'AZ Alkmaar': 77,
  'Dynamo Kijów': 77,
  'Inter Miami': 77,
  'Al-Ittihad': 77,
  'Al-Ahli SFC': 77,
  'Palmeiras': 77,
  'Flamengo': 77,
  'Everton FC': 76,
  'Getafe CF': 76,
  'AC Monza': 76,
  'Werder Brema': 76,
  'Red Bull Salzburg': 76,
  'Celtic FC': 76,
  'PAOK Saloniki': 76,
  'Fulham FC': 76,
  'AFC Bournemouth': 76,
  'Stade de Reims': 76,
  'Vitoria Guimaraes': 76,
  'FC Twente': 76,
  'River Plate': 76,
  'Anderlecht Bruksela': 75,
  'Rangers FC': 75,
  'Panathinaikos AO': 75,
  'Columbus Crew': 75,
  'Boca Juniors': 75,
  'CA Osasuna': 75,
  'Deportivo Alaves': 75,
  'Celta Vigo': 75,
  'Genoa CFC': 75,
  'FC Heidenheim': 75,
  'Union Berlin': 75,
  'Mainz 05': 75,
  'RC Strasbourg': 75,
  'LA Galaxy': 74,
  'UD Las Palmas': 73,
  'Sassuolo Calcio': 73,
  'Leicester City': 73,

  // === TOP 5 POLSKICH KLUBÓW ===
  // (Najlepsze zespoły z Polski wg rankingu krajowego i UEFA z 2025 roku)
  'Lech Poznań': 67,
  'Legia Warszawa': 67,
  'Raków Częstochowa': 65,
  'Jagiellonia Białystok': 65,
  'Pogoń Szczecin': 64
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
