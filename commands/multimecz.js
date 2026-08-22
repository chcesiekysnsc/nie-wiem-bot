const { generateMatch } = require('./mecz');
const { createUser, withData } = require('../utils/storage');
const { getPolishMidnight, msToReadable } = require('../utils/economy');
const { isMatchBanned } = require('../utils/matchBanSystem');
const { hasActiveGameSession } = require('../utils/gameStatePersistence');

module.exports = {
  name: 'multimecz',
  aliases: [],
  async execute(client, message, args) {
    if (!client.activeMultiMatches) {
      client.activeMultiMatches = new Map();
    }

    const userId = message.author.id;

    const banCheck = await isMatchBanned(userId);
    if (banCheck.banned) {
      await message.reply(banCheck.error);
      return;
    }

    // Check if there is an active proposal already to prevent rerolling
    let activeMulti = client.activeMultiMatches.get(userId);

    if (activeMulti) {
      let response = `⚽ **AKTYWNA OFERTA MULTI-MECZU** ⚽\n\n`;
      activeMulti.matches.forEach((match, idx) => {
        response += `**${idx + 1}.** 🏠 **${match.home}** 🆚 **${match.away}** ✈️\n` +
                    `   📈 1: **${match.odds[1]}** | X: **${match.odds['x']}** | 2: **${match.odds[2]}**\n\n`;
      });
      response += `👉 Aby obstawić ten kupon (AKO), wpisz: **!multiobstaw <nr_meczu> <typ> <stawka> ...** (np. **!mo 1 1 5000 2 x 10000** lub **!mo 1 1 2 x 15000**).\n` +
                  `💡 *Masz już aktywną ofertę. Musisz ją obstawić przed wygenerowaniem kolejnej.*`;

      await message.reply(response);
      return;
    }

    if (hasActiveGameSession(client, userId)) {
      await message.reply('❌ Masz już aktywną inną grę! Zakończ ją przed rozpoczęciem multi-meczu.');
      return;
    }

    // Determine count of matches (default 5, max 10, min 2)
    let count = 5;
    if (args.length > 0) {
      const parsed = parseInt(args[0], 10);
      if (!isNaN(parsed)) {
        if (parsed < 2 || parsed > 10) {
          await message.reply('❌ Liczba meczów w multi-meczu musi wynosić od 2 do 10.');
          return;
        }
        count = parsed;
      }
    }

    // Generate new matches
    const matches = [];
    for (let i = 0; i < count; i++) {
      matches.push(generateMatch());
    }

    client.activeMultiMatches.set(userId, { matches });

    let response = `⚽ **NOWA OFERTA MULTI-MECZU** ⚽\n\n`;
    matches.forEach((match, idx) => {
      response += `**${idx + 1}.** 🏠 **${match.home}** 🆚 **${match.away}** ✈️\n` +
                  `   📈 1: **${match.odds[1]}** | X: **${match.odds['x']}** | 2: **${match.odds[2]}**\n\n`;
    });
    response += `👉 Aby obstawić ten kupon (AKO), wpisz: **!multiobstaw <nr_meczu> <typ> <stawka> ...** (np. **!mo 1 1 5000 2 x 10000** lub **!mo 1 1 2 x 15000**).\n` +
                `💡 *Kursy zostaną pomnożone jak w prawdziwym bukmacherze!*`;

    await message.reply(response);
  }
};
