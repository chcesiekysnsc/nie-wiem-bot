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

const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const STREAK_GRACE_MS = 48 * 60 * 60 * 1000;

module.exports = {
  name: 'daily',
  aliases: [],
  async execute(client, message) {
    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const now = Date.now();

      if (user.dailyCooldown > now) {
        return {
          error: `Zaczekaj jeszcze **${msToReadable(user.dailyCooldown - now)}**.`
        };
      }

      const lastClaim = user.lastDailyClaim || 0;
      if (now - lastClaim <= STREAK_GRACE_MS) {
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
      user.dailyCooldown = now + DAILY_COOLDOWN_MS;
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
