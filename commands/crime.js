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

      let amount = randomInt(5000, 30000);

      // Zastosuj bonus gangowy: Złodziejski Fach
      let gangBonus = 0;
      if (success && user.gangId && store.profiles.gangs && store.profiles.gangs[user.gangId]) {
        const gang = store.profiles.gangs[user.gangId];
        const fachLvl = gang.levelFach || 0;
        const multipliers = [1.0, 1.04, 1.08, 1.12];
        const multiplier = multipliers[fachLvl] || 1.0;
        if (fachLvl > 0) {
          gangBonus = [0, 4, 8, 12][fachLvl] || 0;
        }
        amount = Math.floor(amount * multiplier);
      }

      let tribute = 0;
      if (success && user.gangId && store.profiles.gangs && store.profiles.gangs[user.gangId]) {
        const gang = store.profiles.gangs[user.gangId];
        const tributePercent = gang.tributePercent || 0;
        const isExcluded = user.gangRole === 'boss' || user.gangRole === 'deputy';
        if (tributePercent > 0 && !isExcluded) {
          tribute = Math.floor(amount * (tributePercent / 100));
        }
      }

      if (success) {
        const netAmount = amount - tribute;
        user.balance += netAmount;
        if (tribute > 0) {
          const gang = store.profiles.gangs[user.gangId];
          const bossUser = createUser(gang.bossId, store.users);
          bossUser.balance += tribute;
        }
        recordGame(user, netAmount);
        refreshBadges(user, inventory);
        return {
          success: true,
          amount: netAmount,
          tribute,
          gangBonus,
          text: successLines[Math.floor(Math.random() * successLines.length)]
        };
      } else {
        user.balance -= amount;
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
      const bonusText = result.gangBonus ? ` (w tym **+${result.gangBonus}%** z fachu gangu)` : '';
      if (result.tribute > 0) {
        await message.reply(`🎭 Napad: ${result.text} Zysk: **+${formatCurrency(result.amount)}**${bonusText} (pobrano **${formatCurrency(result.tribute)}** haraczu dla Bossa)`);
      } else {
        await message.reply(`🎭 Napad: ${result.text} Zysk: **+${formatCurrency(result.amount)}**${bonusText}`);
      }
    } else {
      await message.reply(`🚔 Wpadka: ${result.text} Strata: **-${formatCurrency(result.amount)}**`);
    }
  }
};
