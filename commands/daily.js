const config = require('../config/config');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const {
  ensureInventoryRecord,
  formatCurrency,
  hasItem,
  msToReadable,
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
  name: 'daily',
  aliases: [],
  async execute(client, message) {
    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const now = Date.now();
      const todayMidnight = getPolishMidnight(new Date(now));

      if (user.lastDailyClaim && user.lastDailyClaim >= todayMidnight) {
        const tomorrowMidnight = getPolishMidnight(new Date(todayMidnight + 26 * 60 * 60 * 1000));
        return {
          error: `Zaczekaj jeszcze **${msToReadable(tomorrowMidnight - now)}**.`
        };
      }

      const yesterdayMidnight = getPolishMidnight(new Date(todayMidnight - 12 * 60 * 60 * 1000));
      const lastClaim = user.lastDailyClaim || 0;

      if (lastClaim >= yesterdayMidnight) {
        user.dailyStreak = (user.dailyStreak || 0) + 1;
      } else {
        user.dailyStreak = 1;
      }

      const streakBonus = (user.dailyStreak - 1) * 1000;
      let reward = 20000 + streakBonus;

      if (hasItem(inventory, 'vip')) {
        reward = Math.floor(reward * config.economy.dailyVipBonus);
      }

      user.balance += reward;
      const tomorrowMidnight = getPolishMidnight(new Date(todayMidnight + 26 * 60 * 60 * 1000));
      user.dailyCooldown = tomorrowMidnight;
      user.lastDailyClaim = now;
      refreshBadges(user, inventory);

      return {
        reward,
        streak: user.dailyStreak
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    await message.reply(`📅 Odebrano daily! **+${formatCurrency(result.reward)}** (Dzień: ${result.streak})`);
  }
};
