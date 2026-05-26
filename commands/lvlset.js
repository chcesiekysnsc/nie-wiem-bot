const config = require('../config/config');
const { refreshBadges, ensureInventoryRecord, MILESTONE_REWARDS, getMilestoneRewardDescription, giveMilestoneReward } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'lvlset',
  aliases: [],
  async execute(client, message, args) {
    // Sprawdź czy to twórca bota
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Brak uprawnień do tej komendy.');
      return;
    }

    const targetLvl = parseInt(args[0], 10);
    if (isNaN(targetLvl) || targetLvl < 1 || targetLvl > 100) {
      await message.reply('❌ Podaj poprawny poziom (1-100): **!lvlset <poziom>**');
      return;
    }

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const oldLvl = user.level;
      const inv = ensureInventoryRecord(store.inventory, message.author.id);
      
      const awardedMilestones = [];
      user.claimedMilestones = user.claimedMilestones || [];
      if (targetLvl > oldLvl) {
        for (let l = oldLvl + 1; l <= targetLvl; l++) {
          if (MILESTONE_REWARDS[l]) {
            giveMilestoneReward(user, l, inv);
            awardedMilestones.push(l);
            if (!user.claimedMilestones.includes(l)) {
              user.claimedMilestones.push(l);
            }
          }
        }
      }

      user.level = targetLvl;
      user.xp = 0; // resetuj xp na nowym poziomie
      
      refreshBadges(user, inv);
      
      return {
        oldLvl,
        awardedMilestones
      };
    });

    let replyMsg = `✅ Ustawiono Twój poziom na **${targetLvl}** (XP zresetowane do 0).`;
    
    if (result.awardedMilestones.length > 0) {
      replyMsg += `\n\n🎉 **OSIĄGNIĘTO KAMIEŃ MILOWY!**`;
      for (const lvl of result.awardedMilestones) {
        replyMsg += `\n🎁 Otrzymałeś nagrodę kamienia milowego za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
      }
    }

    await message.reply(replyMsg);
  }
};
