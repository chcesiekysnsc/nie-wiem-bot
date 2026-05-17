const config = require('../config/config');
const { errorEmbed, successEmbed } = require('../utils/embeds');
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

const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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
          error: `Wroc za **${msToReadable(user.dailyCooldown - now)}** po kolejna nagrode.`
        };
      }

      let reward = randomInt(config.economy.dailyMin, config.economy.dailyMax);
      if (hasItem(inventory, 'vip')) {
        reward = Math.floor(reward * config.economy.dailyVipBonus);
      }

      user.balance += reward;
      user.dailyCooldown = now + DAILY_COOLDOWN_MS;
      const leveledUp = addXp(user, randomInt(20, 40));
      refreshBadges(user, inventory);

      return {
        reward,
        leveledUp
      };
    });

    if (result.error) {
      await message.reply({ embeds: [errorEmbed('Daily', result.error)] });
      return;
    }

    const embed = successEmbed('Daily odebrane', `Zgarnales ${formatCurrency(result.reward)} z codziennej nagrody.`)
      .addFields({ name: 'Nastepny claim', value: 'Za 24h', inline: true });

    if (result.leveledUp) {
      embed.addFields({ name: 'Level up', value: 'Daily wbilo ci kolejny level.', inline: false });
    }

    await message.reply({ embeds: [embed] });
  }
};
