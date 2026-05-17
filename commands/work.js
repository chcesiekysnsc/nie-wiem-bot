const config = require('../config/config');
const { successEmbed } = require('../utils/embeds');
const {
  addXp,
  ensureInventoryRecord,
  formatCurrency,
  hasItem,
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

      let reward = randomInt(config.economy.workMin, config.economy.workMax);
      if (hasItem(inventory, 'vip')) {
        reward = Math.floor(reward * config.economy.workVipBonus);
      }

      user.balance += reward;
      const leveledUp = addXp(user, randomInt(12, 24));
      refreshBadges(user, inventory);

      return {
        reward,
        leveledUp,
        text: jobs[randomInt(0, jobs.length - 1)]
      };
    });

    const embed = successEmbed('Work zakonczone', `${result.text}\n\nZarobiles ${formatCurrency(result.reward)}.`);

    if (result.leveledUp) {
      embed.addFields({ name: 'Level up', value: 'Praca wbila ci kolejny level.', inline: false });
    }

    await message.reply({ embeds: [embed] });
  }
};
