const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord, resolveAmount, randomInt } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const TEAMS = {
  // Angielskie (Premier League)
  'Manchester City': 93,
  'Arsenal FC': 90,
  'Liverpool FC': 91,
  'Chelsea FC': 84,
  'Manchester United': 83,
  'Tottenham Hotspur': 83,
  'Aston Villa': 83,
  'Newcastle United': 82,
  'West Ham United': 79,
  'Brighton & Hove Albion': 80,

  // Hiszpańskie (La Liga)
  'Real Madryt': 94,
  'FC Barcelona': 90,
  'Atletico Madryt': 86,
  'Real Sociedad': 81,
  'Athletic Bilbao': 81,
  'Girona FC': 81,
  'Real Betis': 80,
  'Sevilla FC': 79,
  'Villarreal CF': 79,

  // Niemieckie (Bundesliga)
  'Bayern Monachium': 90,
  'Bayer Leverkusen': 88,
  'Borussia Dortmund': 86,
  'RB Lipsk': 83,
  'VfB Stuttgart': 81,
  'Eintracht Frankfurt': 80,

  // Włoskie (Serie A)
  'Inter Mediolan': 89,
  'AC Milan': 84,
  'Juventus FC': 85,
  'Atalanta Bergamo': 84,
  'SSC Napoli': 84,
  'AS Roma': 82,
  'Lazio Rzym': 81,
  'Fiorentina': 80,
  'Bologna FC': 79,

  // Francuskie (Ligue 1)
  'Paris Saint-Germain': 89,
  'AS Monaco': 81,
  'Olympique Marsylia': 79,
  'Lille OSC': 79,

  // Inne europejskie
  'FC Porto': 81,
  'SL Benfica': 81,
  'Sporting CP': 83,
  'PSV Eindhoven': 81,
  'Feyenoord': 80,
  'Ajax Amsterdam': 78,

  // Polskie (Ekstraklasa)
  'Legia Warszawa': 70,
  'Lech Poznań': 70,
  'Raków Częstochowa': 69,
  'Jagiellonia Białystok': 69,
  'Pogoń Szczecin': 68,
  'Śląsk Wrocław': 67,
  'Wisła Kraków': 64
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
  async execute(client, message, args) {
    if (!client.activeMatches) {
      client.activeMatches = new Map();
    }

    const userId = message.author.id;

    // 1. Sprawdzenie oferty (wywołanie !mecz bez argumentów)
    if (args.length === 0) {
      const match = generateMatch();
      client.activeMatches.set(userId, match);

      const response = 
        `⚽ **PROPOZYCJA MECZU** ⚽\n` +
        `🏠 **${match.home}** 🆚 **${match.away}** ✈️\n\n` +
        `📈 **Kursy bukmacherskie (1 / X / 2):**\n` +
        `• 1️⃣ Wygrana (${match.home}): **${match.odds[1]}**\n` +
        `• ❌ Remis: **${match.odds['x']}**\n` +
        `• 2️⃣ Wygrana (${match.away}): **${match.odds[2]}**\n\n` +
        `👉 Aby obstawić ten mecz, wpisz: **!mecz <stawka> <1/X/2>** (np. **!mecz 1000 1**).\n` +
        `💡 *Oferta jest ważna do momentu wygenerowania nowego meczu.*`;

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

    // Pobierz ofertę dla użytkownika (jeśli brak, generujemy nową na poczekaniu)
    let match = client.activeMatches.get(userId);
    let wasGeneratedOnTheFly = false;
    if (!match) {
      match = generateMatch();
      wasGeneratedOnTheFly = true;
    }

    // Wyczyszczenie oferty
    client.activeMatches.delete(userId);

    const result = await withData(store => {
      const user = createUser(userId, store.users);
      const inventory = ensureInventoryRecord(store.inventory, userId);
      const bet = resolveAmount(rawBet, user.balance);

      if (!bet || bet <= 0) {
        return { error: '❌ Podaj poprawną kwotę zakładu.' };
      }

      if (bet > user.balance) {
        return { error: `❌ Nie masz tylu monet. Posiadasz: ${formatCurrency(user.balance)}` };
      }

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
      const odds = match.odds[rawType];
      let net = 0;

      if (won) {
        net = Math.round(bet * odds) - bet;
        user.balance += net;
      } else {
        net = -bet;
        user.balance -= bet;
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
        odds,
        balance: user.balance,
        xpResult
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const typeLabels = {
      1: match.home,
      x: 'Remis',
      2: match.away
    };

    let replyText = 
      `⚽ **ZAKŁAD SPORTOWY** ⚽\n` +
      `Mecz: **${match.home}** vs **${match.away}**\n` +
      `Twój typ: **${typeLabels[rawType]}** (kurs: **${result.odds}**)\n\n` +
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
  }
};
