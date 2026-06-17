const config = require('../config/config');
const {
  ensureInventoryRecord,
  formatCurrency,
  hasItem,
  msToReadable,
  recordGame,
  refreshBadges
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

function getPolandOffsetMs(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const getVal = type => Number(parts.find(p => p.type === type).value);
  
  const utcDate = Date.UTC(
    getVal('year'),
    getVal('month') - 1,
    getVal('day'),
    getVal('hour'),
    getVal('minute'),
    getVal('second')
  );
  
  return utcDate - date.getTime();
}

function getPolishMidnight(date) {
  const offset = getPolandOffsetMs(date);
  const polandTime = date.getTime() + offset;
  const todayMidnight = new Date(polandTime);
  todayMidnight.setUTCHours(0, 0, 0, 0);
  return todayMidnight.getTime() - offset;
}

module.exports = {
  name: 'kosc',
  aliases: ['dice', 'kostka'],
  async execute(client, message) {
    const authorId = message.author.id;

    const result = await withData(store => {
      const user = createUser(authorId, store.users);
      const inventory = ensureInventoryRecord(store.inventory, authorId);
      const now = Date.now();

      // 1. Sprawdzenie posiadania Kostki Ryzyka
      if (!hasItem(inventory, 'kosc_ryzyka')) {
        return { error: '❌ Musisz posiadać 🎲 **Kostkę Ryzyka** w swoim ekwipunku, aby użyć tej komendy!' };
      }

      // 2. Cooldown (reset o północy w Polsce)
      const todayMidnight = getPolishMidnight(new Date(now));
      if (user.lastKoscTime && user.lastKoscTime >= todayMidnight) {
        const tomorrowMidnight = getPolishMidnight(new Date(todayMidnight + 26 * 60 * 60 * 1000));
        return {
          error: `⏳ Użyłeś już dzisiaj Kostki Ryzyka. Następny rzut możesz wykonać za: **${msToReadable(tomorrowMidnight - now)}**.`
        };
      }

      // 3. Sprawdzenie czy gracz wygrał coś w kasynie
      const lastWin = user.lastGambleWin || 0;
      if (lastWin <= 0) {
        return { error: '❌ Nie masz żadnej zapisanej ostatniej wygranej netto z kasyna (np. z !bet, !cf, !bj), którą mógłbyś zaryzykować!' };
      }

      // Stawka to ostatnia wygrana netto, max 500k
      const stake = Math.min(500000, lastWin);

      // Losowanie 50/50
      const won = Math.random() < 0.5;

      let netChange = 0;
      if (won) {
        user.balance += stake;
        netChange = stake;
      } else {
        user.balance -= stake;
        netChange = -stake;
      }

      // Zapisz czas i wyczyść ostatnią wygraną
      user.lastKoscTime = now;
      user.lastGambleWin = 0;

      // Zapisz grę w statystykach
      const xpResult = recordGame(user, netChange, 25, inventory);
      refreshBadges(user, inventory);

      return {
        won,
        stake,
        balance: user.balance,
        xpResult
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const rollText = result.won ? `✅ **SUKCES!** Wygrana! Podwoiłeś stawkę i zyskujesz **+${formatCurrency(result.stake)}**!` : `❌ **PRZEGRANA!** Straciłeś stawkę **-${formatCurrency(result.stake)}**!`;
    let replyText = `🎲 **RZUT KOSTKĄ RYZYKA** 🎲\n` +
      `Stawka ryzyka (ostatnia wygrana netto do 500k): **${formatCurrency(result.stake)}**\n\n` +
      `${rollText}\n` +
      `👛 Portfel: **${formatCurrency(result.balance)}**`;

    if (result.xpResult && result.xpResult.leveledUp) {
      replyText += `\n🎉 **AWANS!** Awansowałeś na **poziom ${result.xpResult.newLevel}**!`;
    }

    await message.reply(replyText);
  }
};
