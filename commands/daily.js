const config = require('../config/config');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const {
  ensureInventoryRecord,
  formatCurrency,
  hasItem,
  msToReadable,
  refreshBadges,
  getGlobalIncomeMultiplier,
  getItemSetBonus,
  getItemUpgradeLevel
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

      const hasSzwajcar = hasItem(inventory, 'szwajcarski_zegarek');
      const offsetHours = hasSzwajcar ? 3.6 * 60 * 60 * 1000 : 0;

      if (user.lastDailyClaim && user.lastDailyClaim >= (todayMidnight - offsetHours)) {
        const tomorrowMidnight = getPolishMidnight(new Date(todayMidnight + 26 * 60 * 60 * 1000));
        return {
          error: `Zaczekaj jeszcze **${msToReadable(tomorrowMidnight - offsetHours - now)}**.`
        };
      }

      const yesterdayMidnight = getPolishMidnight(new Date(todayMidnight - 12 * 60 * 60 * 1000));
      const lastClaim = user.lastDailyClaim || 0;

      const hasIkona = user.badges && user.badges.includes(config.badges.ikona);
      const streakResetLimit = hasIkona ? 7 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
      const streakResetMidnight = getPolishMidnight(new Date(todayMidnight - streakResetLimit));

      if (lastClaim >= streakResetMidnight) {
        user.dailyStreak = (user.dailyStreak || 0) + 1;
      } else {
        user.dailyStreak = 1;
      }

      const streakBonus = (user.dailyStreak - 1) * 1000;
      let reward = 20000 + streakBonus;

      if (hasItem(inventory, 'vip')) {
        const level = getItemUpgradeLevel(inventory, 'vip');
        const bonus = 0.25 + level * 0.02;
        reward = Math.floor(reward * (1 + bonus));
      }

      let dailyBonusMult = 1.0;
      if (user.badges) {
        if (user.badges.includes(config.badges.gadatliwy)) {
          dailyBonusMult += 0.04;
        }
        if (user.badges.includes(config.badges.spamer)) {
          dailyBonusMult += 0.08;
        }
        if (user.badges.includes(config.badges.krolSpamu)) {
          dailyBonusMult += 0.12;
        }

        if (user.badges.includes(config.badges.married)) {
          dailyBonusMult += 0.02;
        }

        if (user.badges.includes(config.badges.regularny)) {
          dailyBonusMult += 0.10;
        }
        if (user.badges.includes(config.badges.wytrwaly)) {
          dailyBonusMult += 0.15;
        }
        if (user.badges.includes(config.badges.weteran_streak)) {
          dailyBonusMult += 0.20;
        }
        if (user.badges.includes(config.badges.legenda)) {
          dailyBonusMult += 0.25;
        }
        if (user.badges.includes(config.badges.ikona)) {
          dailyBonusMult += 0.30;
        }
      }
      reward = Math.floor(reward * dailyBonusMult);

      let dailyMultiplier = 1;
      if (user.badges) {
        if (user.badges.includes(config.badges.legenda)) {
          if (Math.random() < 0.04) dailyMultiplier *= 3;
          else if (Math.random() < 0.10) dailyMultiplier *= 2;
        }
        if (user.badges.includes(config.badges.ikona)) {
          if (Math.random() < 0.07) dailyMultiplier *= 3;
          else if (Math.random() < 0.125) dailyMultiplier *= 2;
        }
      }
      reward = Math.floor(reward * dailyMultiplier);

      if (hasItem(inventory, 'krolewskie_insygnia')) {
        reward = Math.floor(reward * 1.10);
      }

      const globalIncomeBonus = getGlobalIncomeMultiplier(inventory);
      if (globalIncomeBonus > 0) {
        reward = Math.floor(reward * (1 + globalIncomeBonus));
      }

      const userGangId = user.gangId;
      if (userGangId && store.profiles.gangs && store.profiles.gangs[userGangId]) {
        const { getTerritoryBonus } = require('../utils/territories');
        const territoryBonus = getTerritoryBonus(userGangId, 'daily');
        if (territoryBonus > 0) {
          reward = Math.floor(reward * (1 + territoryBonus));
        }
      }

      user.balance += reward;
      const tomorrowMidnight = getPolishMidnight(new Date(todayMidnight + 26 * 60 * 60 * 1000));
      user.dailyCooldown = tomorrowMidnight;
      user.lastDailyClaim = now;
      refreshBadges(user, inventory);

      return {
        reward,
        streak: user.dailyStreak,
        dailyMultiplier
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    let reply = `📅 Odebrano daily! **+${formatCurrency(result.reward)}** (Dzień: ${result.streak})`;
    if (result.dailyMultiplier && result.dailyMultiplier > 1) {
      const multText = result.dailyMultiplier === 3 ? '**POTRÓJNE DAILY!** 🎉' : '**PODWÓJNE DAILY!** 🎉';
      reply = `📅 Odebrano daily! ${multText} **+${formatCurrency(result.reward)}** (Dzień: ${result.streak})`;
    }
    await message.reply(reply);
  }
};
