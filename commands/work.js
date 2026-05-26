const config = require('../config/config');
const {
  addXp,
  ensureInventoryRecord,
  formatCurrency,
  hasItem,
  msToReadable,
  randomInt,
  refreshBadges
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const jobs = [
  'Ogarnales nocna zmiane przy stolach pokerowych.',
  'Sprzedales premium wejscia do strefy VIP.',
  'Polerowales zlote zetoniki i dostales napiwek.',
  'Dopilnowales skladu sejfu i zgarnaes premie.'
];

module.exports = {
  name: 'work',
  aliases: [],
  async execute(client, message) {
    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);

      const now = Date.now();
      const hasZegar = hasItem(inventory, 'stary_zegar');
      const baseCd = config.cooldowns.work || 600;
      const actualCd = hasZegar ? baseCd * 0.90 : baseCd;
      const cdMs = actualCd * 1000;
      const last = user.lastWorkTime || 0;
      const diff = now - last;

      if (diff < cdMs) {
        return { error: `⏳ Byłeś już w pracy! Wróć za **${msToReadable(cdMs - diff)}**.` };
      }

      let reward = randomInt(config.economy.workMin, config.economy.workMax);
      if (hasItem(inventory, 'vip')) {
        reward = Math.floor(reward * config.economy.workVipBonus);
      }

      if (user.badges && user.badges.includes(config.badges.krolSpamu)) {
        reward = Math.floor(reward * 1.05);
      }

      // Zastosuj bonus gangowy: Legalne Biznesy
      let gangBonus = 0;
      if (user.gangId && store.profiles.gangs && store.profiles.gangs[user.gangId]) {
        const gang = store.profiles.gangs[user.gangId];
        const idxBiz = gang.levelBiznesy || 0;
        const multipliers = [1.0, 1.10, 1.20, 1.30];
        const multiplier = multipliers[idxBiz] || 1.0;
        if (idxBiz > 0) {
          gangBonus = [0, 10, 20, 30][idxBiz] || 0;
        }
        reward = Math.floor(reward * multiplier);
      }

      // Oblicz haracza, jeśli gracz należy do gangu
      let tributeAmount = 0;
      if (user.gangId && store.profiles.gangs && store.profiles.gangs[user.gangId]) {
        const gang = store.profiles.gangs[user.gangId];
        const tributePercent = gang.tributePercent || 0;
        const isExcluded = user.gangRole === 'boss' || user.gangRole === 'deputy';
        if (tributePercent > 0 && !isExcluded) {
          tributeAmount = Math.floor(reward * (tributePercent / 100));
          user.balance += reward - tributeAmount;
          // Dodaj haracza do sejfu gangu i do portfela Bossa
          gang.vault += tributeAmount;
          const bossUser = createUser(gang.bossId, store.users);
          bossUser.balance += tributeAmount;
        } else {
          user.balance += reward;
        }
      } else {
        user.balance += reward;
      }

      user.lastWorkTime = now;
      const xpResult = addXp(user, randomInt(12, 24), inventory);
      refreshBadges(user, inventory);

      return {
        reward,
        tributeAmount,
        gangBonus,
        xpResult,
        text: jobs[randomInt(0, jobs.length - 1)]
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const bonusText = result.gangBonus ? ` (w tym **+${result.gangBonus}%** z biznesów gangu)` : '';
    const finalReward = result.reward - result.tributeAmount;
    let replyText = '';

    if (result.tributeAmount > 0) {
      replyText = `👷 ${result.text} Zysk: **+${formatCurrency(finalReward)}**${bonusText} (pobrano **${formatCurrency(result.tributeAmount)}** haraczu dla Bossa)`;
    } else {
      replyText = `👷 ${result.text} Zysk: **+${formatCurrency(finalReward)}**${bonusText}`;
    }

    if (result.xpResult && result.xpResult.leveledUp) {
      replyText += `\n🎉 **AWANS!** Awansowałeś na **poziom ${result.xpResult.newLevel}**!`;
      if (result.xpResult.milestonesGained && result.xpResult.milestonesGained.length > 0) {
        const { getMilestoneRewardDescription } = require('../utils/economy');
        for (const lvl of result.xpResult.milestonesGained) {
          replyText += `\n🎁 Otrzymałeś nagrodę kamienia milowego za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
        }
      }
    }

    await message.reply(replyText);
  }
};
