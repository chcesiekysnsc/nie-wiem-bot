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

      // Zastosuj bonus gangowy: Legalne Biznesy
      let gangBonus = 0;
      if (user.gangId && store.profiles.gangs && store.profiles.gangs[user.gangId]) {
        const gang = store.profiles.gangs[user.gangId];
        const bizLvl = gang.levelBiznesy || 0;
        const multipliers = [1.0, 1.10, 1.20, 1.30];
        const multiplier = multipliers[bizLvl] || 1.0;
        if (bizLvl > 0) {
          gangBonus = [0, 10, 20, 30][bizLvl] || 0;
        }
        reward = Math.floor(reward * multiplier);
      }

      // Oblicz haracza, jeśli gracz należy do gangu
      let tributeAmount = 0;
      if (user.gangId && store.profiles.gangs && store.profiles.gangs[user.gangId]) {
        const gang = store.profiles.gangs[user.gangId];
        const tributePercent = gang.tributePercent || 0;
        if (tributePercent > 0) {
          tributeAmount = Math.floor(reward * (tributePercent / 100));
          user.balance += reward - tributeAmount;
          // Dodaj haracza do sejfu gangu i do portfela Bossa
          gang.vault += tributeAmount;
        } else {
          user.balance += reward;
        }
      } else {
        user.balance += reward;
      }

      const leveledUp = addXp(user, randomInt(12, 24));
      refreshBadges(user, inventory);

      return {
        reward,
        tributeAmount,
        gangBonus,
        leveledUp,
        text: jobs[randomInt(0, jobs.length - 1)]
      };
    });

    const bonusText = result.gangBonus ? ` (w tym **+${result.gangBonus}%** z biznesów gangu)` : '';
    const tributeText = result.tributeAmount > 0 ? `\n\n💰 Haracza dla gangu: **-${formatCurrency(result.tributeAmount)}**` : '';
    const finalReward = result.reward - result.tributeAmount;
    const embed = successEmbed('👷 Praca — zarobek', `${result.text}\n\n+**${formatCurrency(finalReward)}** (brutto: ${formatCurrency(result.reward)})${bonusText}${tributeText}`);
    await message.reply({ embeds: [embed] });
  }
};
