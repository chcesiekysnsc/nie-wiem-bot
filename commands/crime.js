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
      
      let baseSuccessChance = 0.50;
      if (user.badges) {
        if (user.badges.includes(config.badges.boss)) {
          baseSuccessChance += 0.05;
        } else if (user.badges.includes(config.badges.zastepca)) {
          baseSuccessChance += 0.03;
        } else if (user.badges.includes(config.badges.czlonek)) {
          baseSuccessChance += 0.015;
        }
      }
      const success = Math.random() < baseSuccessChance;

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
        const xpResult = recordGame(user, netAmount, 25, inventory);
        refreshBadges(user, inventory);
        return {
          success: true,
          amount: netAmount,
          tribute,
          gangBonus,
          xpResult,
          text: successLines[Math.floor(Math.random() * successLines.length)]
        };
      } else {
        user.balance -= amount;
        const xpResult = recordGame(user, -amount, 25, inventory);
        refreshBadges(user, inventory);
        return {
          success: false,
          amount,
          xpResult,
          text: failLines[Math.floor(Math.random() * failLines.length)]
        };
      }
    });

    let replyText = '';
    if (result.success) {
      const bonusText = result.gangBonus ? ` (w tym **+${result.gangBonus}%** z fachu gangu)` : '';
      if (result.tribute > 0) {
        replyText = `🎭 Napad: ${result.text} Zysk: **+${formatCurrency(result.amount)}**${bonusText} (pobrano **${formatCurrency(result.tribute)}** haraczu dla Bossa)`;
      } else {
        replyText = `🎭 Napad: ${result.text} Zysk: **+${formatCurrency(result.amount)}**${bonusText}`;
      }
    } else {
      replyText = `🚔 Wpadka: ${result.text} Strata: **-${formatCurrency(result.amount)}**`;
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
