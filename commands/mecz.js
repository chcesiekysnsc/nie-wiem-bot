const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord, resolveAmount, randomInt } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const TEAMS = [
  'Real Madryt', 'FC Barcelona', 'Bayern Monachium', 'Paris Saint-Germain',
  'Manchester City', 'Liverpool FC', 'Arsenal FC', 'Chelsea FC',
  'Juventus FC', 'AC Milan', 'Inter Mediolan', 'Atletico Madryt',
  'Borussia Dortmund', 'Manchester United', 'Tottenham Hotspur',
  'SSC Napoli', 'AS Roma', 'Bayer Leverkusen', 'FC Porto', 'SL Benfica',
  'Real Betis', 'Sevilla FC', 'Fiorentina', 'Lazio Rzym', 'Villarreal CF'
];

function generateMatch() {
  const homeIdx = randomInt(0, TEAMS.length - 1);
  let awayIdx = randomInt(0, TEAMS.length - 1);
  while (awayIdx === homeIdx) {
    awayIdx = randomInt(0, TEAMS.length - 1);
  }

  const home = TEAMS[homeIdx];
  const away = TEAMS[awayIdx];

  // Generowanie siły drużyn (70 - 95)
  const homeStrength = randomInt(70, 95);
  const awayStrength = randomInt(68, 93);

  // Prawdopodobieństwa (suma = 1.0)
  const totalStrength = homeStrength + awayStrength;
  const pHome = (homeStrength / totalStrength) * 0.72;
  const pAway = (awayStrength / totalStrength) * 0.72;
  const pDraw = 0.28;

  // Obliczanie kursów z marżą kasyna (ok. 8%)
  const margin = 0.92;
  const oddsHome = parseFloat(Math.max(1.10, margin / pHome).toFixed(2));
  const oddsAway = parseFloat(Math.max(1.10, margin / pAway).toFixed(2));
  const oddsDraw = parseFloat(Math.max(1.10, margin / pDraw).toFixed(2));

  return {
    home,
    away,
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

      if (roll < match.probabilities.home) {
        outcome = '1';
        homeGoals = randomInt(1, 4);
        awayGoals = randomInt(0, homeGoals - 1);
      } else if (roll < match.probabilities.home + match.probabilities.draw) {
        outcome = 'x';
        homeGoals = randomInt(0, 3);
        awayGoals = homeGoals;
      } else {
        outcome = '2';
        awayGoals = randomInt(1, 4);
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
