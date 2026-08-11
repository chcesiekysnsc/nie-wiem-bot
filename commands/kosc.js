const config = require('../config/config');
const {
  ensureInventoryRecord,
  formatCurrency,
  hasItem,
  msToReadable,
  recordGame,
  refreshBadges,
  getActiveEventMultiplier,
  getItemUpgradeLevel,
  getRandomXp
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
  async execute(client, message, args) {
    const authorId = message.author.id;
    const variant = String(args && args[0] || '').toLowerCase();

    const result = await withData(store => {
      const user = createUser(authorId, store.users);
      const inventory = ensureInventoryRecord(store.inventory, authorId);
      const now = Date.now();

      // 1. Wybór wariantu i sprawdzenie przedmiotu
      let requiredItem = null;
      let winAmount = 500000;

      if (variant === 'ryzyka') {
        requiredItem = 'kosc_ryzyka';
        winAmount = 750000;
      } else if (variant === 'losu') {
        requiredItem = 'kostka_losu';
        winAmount = 500000;
      } else {
        requiredItem = 'kosc_ryzyka';
        winAmount = 500000;
      }

      if (!hasItem(inventory, requiredItem)) {
        const itemName = requiredItem === 'kosc_ryzyka' ? 'Kostkę Ryzyka' : 'Kostkę Losu';
        return { error: `❌ Musisz posiadać 🎲 **${itemName}** w swoim ekwipunku, aby użyć tej komendy!` };
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

      const maxStake = 500000;
      const stake = Math.min(maxStake, lastWin);

      // Losowanie 50/50
      const won = Math.random() < 0.5;

      let netChange = 0;
      let loseAmount = 0;
      let winAmountFinal = 0;
      if (won) {
        const evMul = getActiveEventMultiplier('casino');
        let finalWin = evMul > 1 ? Math.round(winAmount * evMul) : winAmount;
        if (hasItem(inventory, 'krolewskie_insygnia')) {
          finalWin = Math.floor(finalWin * 1.10);
        }
        winAmountFinal = finalWin;
        user.balance += finalWin;
        netChange = finalWin;
      } else {
        const loss = variant === 'losu' ? 250000 : stake;
        loseAmount = loss;
        user.balance -= loss;
        netChange = -loss;
      }

      // Zapisz czas i wyczyść ostatnią wygraną
      user.lastKoscTime = now;
      user.lastGambleWin = 0;

      // Zapisz grę w statystykach
      const xpResult = recordGame(user, netChange, getRandomXp(), inventory);
      refreshBadges(user, inventory);

      return {
        won,
        stake,
        loseAmount,
        winAmount: winAmountFinal,
        balance: user.balance,
        xpResult
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const rollText = result.won
      ? `✅ **SUKCES!** Wygrana! Zyskujesz **+${formatCurrency(result.winAmount)}**!`
      : `❌ **PRZEGRANA!** Straciłeś **-${formatCurrency(result.loseAmount)}**!`;
    const variantLabel = variant === 'losu' ? 'Losu' : 'Ryzyka';
    const stakeLabel = variant === 'losu'
      ? `Ryzykujesz 500 000 viccoinów: wygrywasz **300 000** lub tracisz **250 000**`
      : `Ryzykujesz 500 000 viccoinów: wygrywasz **750 000** lub tracisz **500 000**`;
    let replyText = `🎲 **RZUT KOSTKĄ ${variantLabel.toUpperCase()}** 🎲\n` +
      `${stakeLabel}\n\n` +
      `${rollText}\n` +
      `👛 Portfel: **${formatCurrency(result.balance)}**`;

    if (result.xpResult && result.xpResult.leveledUp) {
      replyText += `\n🎉 **AWANS!** Awansowałeś na **poziom ${result.xpResult.newLevel}**!`;
    }

    await message.reply(replyText);
  }
};
