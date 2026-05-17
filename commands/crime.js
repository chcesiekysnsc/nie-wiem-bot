const config = require('../config/config');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const {
  ensureInventoryRecord,
  formatCurrency,
  randomInt,
  recordGame,
  refreshBadges
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const successLines = [
  'Uciekles z sejfem bez zostawienia sladow.',
  'Wlamanie do kasyna sie udalo.',
  'Plan z podrobionym biletem zadzialal idealnie.'
];

const failLines = [
  'Ochrona zlapala cie przy wyjsciu.',
  'Kamery nagraly wszystko i zaplaciles kare.',
  'Alarm odpalil sie za szybko i akcja spalila na panewce.'
];

module.exports = {
  name: 'crime',
  aliases: [],
  async execute(client, message) {
    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const success = Math.random() < config.economy.crimeSuccessChance;

      if (success) {
        let reward = randomInt(config.economy.crimeWinMin, config.economy.crimeWinMax);
        if (Math.random() < 0.18) {
          reward += 150;
        }

        user.balance += reward;
        const leveledUp = recordGame(user, reward, randomInt(22, 40));
        refreshBadges(user, inventory);

        return {
          success: true,
          amount: reward,
          text: successLines[randomInt(0, successLines.length - 1)],
          leveledUp
        };
      }

      const fine = Math.min(user.balance, randomInt(config.economy.crimeLoseMin, config.economy.crimeLoseMax));
      user.balance -= fine;
      const leveledUp = recordGame(user, -fine, randomInt(16, 28));
      refreshBadges(user, inventory);

      return {
        success: false,
        amount: fine,
        text: failLines[randomInt(0, failLines.length - 1)],
        leveledUp
      };
    });

    const embedFactory = result.success ? successEmbed : errorEmbed;
    const embed = embedFactory(
      'Crime',
      result.text
    ).addFields(
      { name: result.success ? 'Zysk' : 'Strata', value: formatCurrency(result.amount), inline: true }
    );

    if (result.leveledUp) {
      embed.addFields({ name: 'Level up', value: 'Dostales level po tej akcji.', inline: false });
    }

    await message.reply({ embeds: [embed] });
  }
};
