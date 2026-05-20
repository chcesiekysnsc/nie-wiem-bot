const config = require('../config/config');
const { formatCurrency, recordGame, refreshBadges, ensureInventoryRecord, randomInt } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const successLines = [
  'Uciekłeś z sejfem bez zostawienia śladów.',
  'Włamanie do kasyna się udało.',
  'Plan z podrobionym biletem zadziałał idealnie.'
];

const failLines = [
  'Ochrona złapała Cię przy wyjściu.',
  'Kamery nagrały wszystko i zapłaciłeś karę.',
  'Alarm odpalił się za szybko i akcja spaliła na panewce.'
];

module.exports = {
  name: 'crime',
  aliases: [],
  async execute(client, message) {
    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const success = Math.random() < 0.50;

      const amount = randomInt(5000, 30000);

      if (success) {
        user.balance += amount;
        recordGame(user, amount);
        refreshBadges(user, inventory);
        return {
          success: true,
          amount,
          text: successLines[Math.floor(Math.random() * successLines.length)]
        };
      } else {
        user.balance = Math.max(0, user.balance - amount);
        recordGame(user, -amount);
        refreshBadges(user, inventory);
        return {
          success: false,
          amount,
          text: failLines[Math.floor(Math.random() * failLines.length)]
        };
      }
    });

    if (result.success) {
      await message.reply(`🎭 Napad: ${result.text} Zysk: **+${formatCurrency(result.amount)}**`);
    } else {
      await message.reply(`🚔 Wpadka: ${result.text} Strata: **-${formatCurrency(result.amount)}**`);
    }
  }
};
