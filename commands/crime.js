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
      
      const roll = randomInt(0, 100);
      let officer = '';
      let baseSuccessChance = 0.50;
      let minGain = 0, maxGain = 0;
      let minLoss = 0, maxLoss = 0;

      if (roll < 40) {
        officer = 'Posterunkowy';
        baseSuccessChance = 0.75;
        minGain = 5000; maxGain = 15000;
        minLoss = 4000; maxLoss = 8000;
      } else if (roll < 70) {
        officer = 'Sierżant';
        baseSuccessChance = 0.60;
        minGain = 15000; maxGain = 35000;
        minLoss = 12000; maxLoss = 25000;
      } else if (roll < 90) {
        officer = 'Dzielnicowy';
        baseSuccessChance = 0.40;
        minGain = 35000; maxGain = 50000;
        minLoss = 30000; maxLoss = 50000;
      } else {
        officer = '☠️ Funkcjonariusz CBŚ';
        baseSuccessChance = 0.20;
        minGain = 50000; maxGain = 80000;
        minLoss = 40000; maxLoss = 70000;
      }

      let finalSuccessChance = baseSuccessChance;
      if (user.badges) {
        if (user.badges.includes(config.badges.boss)) {
          finalSuccessChance += 0.05;
        } else if (user.badges.includes(config.badges.zastepca)) {
          finalSuccessChance += 0.03;
        } else if (user.badges.includes(config.badges.czlonek)) {
          finalSuccessChance += 0.015;
        }
      }

      const success = Math.random() < finalSuccessChance;
      let amount = success ? randomInt(minGain, maxGain + 1) : randomInt(minLoss, maxLoss + 1);

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
          officer,
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
          officer,
          amount,
          xpResult,
          text: failLines[Math.floor(Math.random() * failLines.length)]
        };
      }
    });

    let replyText = '';
    if (result.success) {
      const bonusText = result.gangBonus ? ` (w tym **+${result.gangBonus}%** z fachu gangu)` : '';
      const startText = `🎭 Napad (**${result.officer}**): ${result.text}`;
      if (result.tribute > 0) {
        replyText = `${startText} Zysk: **+${formatCurrency(result.amount)}**${bonusText} (pobrano **${formatCurrency(result.tribute)}** haraczu dla Bossa)`;
      } else {
        replyText = `${startText} Zysk: **+${formatCurrency(result.amount)}**${bonusText}`;
      }
    } else {
      replyText = `🚔 Wpadka: Złapał Cię **${result.officer}** (${result.text}). Strata: **-${formatCurrency(result.amount)}**`;
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
