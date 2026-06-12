const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord, resolveAmount, randomInt } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const TEAMS = {
  // --- ANGLIA (Premier League) ---
  'Manchester City': 93,
  'Liverpool FC': 91,
  'Arsenal FC': 90,
  'Aston Villa': 84,
  'Chelsea FC': 85,
  'Manchester United': 83,
  'Tottenham Hotspur': 83,
  'Newcastle United': 82,
  'Brighton & Hove Albion': 80,
  'West Ham United': 79,
  'Crystal Palace': 78,
  'Brentford FC': 77,
  'Wolverhampton Wanderers': 77,
  'Everton FC': 76,

  // --- HISZPANIA (La Liga) ---
  'Real Madryt': 94,
  'FC Barcelona': 90,
  'Atletico Madryt': 86,
  'Girona FC': 81,
  'Real Sociedad': 81,
  'Athletic Bilbao': 81,
  'Real Betis': 80,
  'Villarreal CF': 79,
  'Sevilla FC': 79,
  'Valencia CF': 77,
  'Getafe CF': 76,

  // --- WŁOCHY (Serie A) ---
  'Inter Mediolan': 89,
  'Juventus FC': 86,
  'Atalanta Bergamo': 85,
  'AC Milan': 84,
  'SSC Napoli': 84,
  'AS Roma': 82,
  'Lazio Rzym': 81,
  'Fiorentina': 80,
  'Bologna FC': 79,
  'Torino FC': 77,
  'AC Monza': 76,

  // --- NIEMCY (Bundesliga) ---
  'Bayern Monachium': 91,
  'Bayer Leverkusen': 89,
  'Borussia Dortmund': 86,
  'RB Lipsk': 84,
  'VfB Stuttgart': 81,
  'Eintracht Frankfurt': 80,
  'SC Freiburg': 79,
  'TSG Hoffenheim': 77,
  'Werder Brema': 76,

  // --- FRANCJA (Ligue 1) ---
  'Paris Saint-Germain': 89,
  'AS Monaco': 82,
  'Lille OSC': 80,
  'Olympique Marsylia': 80,
  'Olympique Lyon': 79,
  'RC Lens': 79,
  'Stade Rennais': 78,

  // --- INNE EUROPEJSKIE ---
  'Sporting CP': 84,
  'PSV Eindhoven': 82,
  'FC Porto': 81,
  'SL Benfica': 81,
  'Fenerbahce SK': 81,
  'Galatasaray SK': 81,
  'Feyenoord': 80,
  'SC Braga': 79,
  'Szachtar Donieck': 79,
  'Ajax Amsterdam': 78,
  'Trabzonspor': 78,
  'Olympiakos Pireus': 78,
  'Club Brugge': 77,
  'Besiktas JK': 77,
  'AZ Alkmaar': 77,
  'Dynamo Kijów': 77,
  'Red Bull Salzburg': 76,
  'Celtic FC': 76,
  'PAOK Saloniki': 76,
  'Anderlecht Bruksela': 75,
  'Rangers FC': 75,
  'Panathinaikos AO': 75,

  // --- POLSKA (Ekstraklasa) ---
  'Lech Poznań': 70,
  'Legia Warszawa': 70,
  'Raków Częstochowa': 69,
  'Jagiellonia Białystok': 69,
  'Pogoń Szczecin': 68,
  'Śląsk Wrocław': 67,
  'Górnik Zabrze': 66,
  'Piast Gliwice': 66,
  'Cracovia': 65,
  'Widzew Łódź': 65,
  'Zagłębie Lubin': 65,
  'Wisła Kraków': 64,
  'Stal Mielec': 64,
  'Radomiak Radom': 64,
  'Lechia Gdańsk': 63,
  'GKS Katowice': 63,
  'Puszcza Niepołomice': 62,
  'Korona Kielce': 62,
  'Motor Lublin': 61,

  // --- INNE ŚWIATOWE ---
  'Al-Hilal': 82,
  'Al-Nassr': 79,
  'Al-Ittihad': 77,
  'Al-Ahli SFC': 77,
  'Inter Miami': 77,
  'Columbus Crew': 75,
  'LA Galaxy': 74
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
