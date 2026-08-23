const config = require('../config/config');
const { msToReadable } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const {
  getGlobalCooldownReduction,
  getActiveEventMultiplier,
  getItemUpgradeLevel,
  hasItem,
  ensureInventoryRecord
} = require('../utils/economy');

function getPolandOffsetMs(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const getVal = type => Number(parts.find(p => p.type === type).value);
  
  const utcDate = Date.UTC(
    getVal('year'),
    getVal('month') - 1,
    getVal('day'),
    getVal('hour'),
    getVal('minute'),
    getVal('second')
  );
  
  return utcDate - date.getTime();
}

function getPolishMidnight(date) {
  const offset = getPolandOffsetMs(date);
  const polandTime = date.getTime() + offset;
  const todayMidnight = new Date(polandTime);
  todayMidnight.setUTCHours(0, 0, 0, 0);
  return todayMidnight.getTime() - offset;
}

module.exports = {
  name: 'cd',
  aliases: ['cooldowns', 'czasy'],
  async execute(client, message) {
    const userId = message.author.id;

    const result = await withData(store => {
      const user = createUser(userId, store.users);
      const now = Date.now();

      // 0. Jail status
      let jailText = '';
      if (user.jailUntil && user.jailUntil > now) {
        jailText = `⛓️ **Jesteś w więzieniu!** Odzyskasz wolność za **${msToReadable(user.jailUntil - now)}**.\n\n`;
      }

      // 1. Daily cooldown
      const todayMidnight = getPolishMidnight(new Date(now));
      let dailyText = '🟢 **GOTOWE!**';
      if (user.lastDailyClaim && user.lastDailyClaim >= todayMidnight) {
        const tomorrowMidnight = getPolishMidnight(new Date(todayMidnight + 26 * 60 * 60 * 1000));
        dailyText = `⏱️ gotowe za **${msToReadable(tomorrowMidnight - now)}**`;
      }

      // 2. Work cooldown
      const userCooldowns = store.cooldowns.commands[userId] || {};
      const storeWorkExpiresAt = Number(userCooldowns['work'] || 0);

      const inventory = ensureInventoryRecord(store.inventory, userId);
      const baseCd = config.cooldowns.work || 600;
      let actualCd = baseCd;

      const hasZegar = hasItem(inventory, 'stary_zegar');
      if (hasZegar) {
        const level = getItemUpgradeLevel(inventory, 'stary_zegar');
        const reduction = 0.10 + level * 0.005;
        actualCd *= (1 - reduction);
      }

      const hasSzwajcar = hasItem(inventory, 'szwajcarski_zegarek');
      if (hasSzwajcar) {
        actualCd *= 0.85;
      }

      const hasEnergetyk = hasItem(inventory, 'energetyk');
      if (hasEnergetyk) {
        const level = getItemUpgradeLevel(inventory, 'energetyk');
        const increase = 0.10 + level * 0.005;
        actualCd *= (1 + increase);
      }

      const cdReduction = getGlobalCooldownReduction(inventory);
      if (cdReduction > 0) {
        actualCd = Math.floor(actualCd * (1 - cdReduction));
      }

      const evMul = getActiveEventMultiplier('cooldowns');
      if (evMul && evMul > 1) {
        actualCd = Math.floor(actualCd / evMul);
      }

      if (user.tempCooldownReductionUntil && now < user.tempCooldownReductionUntil) {
        actualCd = Math.floor(actualCd * 0.8);
      }

      const hasAutomat = hasItem(inventory, 'automat_do_kawy');
      if (hasAutomat) {
        actualCd = Math.floor(actualCd * 0.95);
      }

      const cdMs = actualCd * 1000;
      const lastWork = user.lastWorkTime || 0;
      const localWorkExpiresAt = lastWork + cdMs;

      const jailExpiresAt = Number(user.jailUntil || 0);

      const workExpiresAt = Math.max(storeWorkExpiresAt, localWorkExpiresAt);
      let workText = '🟢 **GOTOWE!**';
      if (jailExpiresAt > now && jailExpiresAt >= workExpiresAt) {
        workText = `⛓️ **w więzieniu** (wyjdziesz za **${msToReadable(jailExpiresAt - now)}**)`;
      } else if (workExpiresAt > now) {
        workText = `⏱️ gotowe za **${msToReadable(workExpiresAt - now)}**`;
      }

      // 3. Crime cooldown
      const storeCrimeExpiresAt = Number(userCooldowns['crime'] || 0);
      let crimeText = '🟢 **GOTOWE!**';
      if (jailExpiresAt > now && jailExpiresAt >= storeCrimeExpiresAt) {
        crimeText = `⛓️ **w więzieniu** (wyjdziesz za **${msToReadable(jailExpiresAt - now)}**)`;
      } else if (storeCrimeExpiresAt > now) {
        crimeText = `⏱️ gotowe za **${msToReadable(storeCrimeExpiresAt - now)}**`;
      }

      // 4. Rob cooldown (checks the in-memory Maps in rob.js)
      const robCmd = require('./rob');
      const robCoolUntil = robCmd.robCooldowns ? (robCmd.robCooldowns.get(userId) || 0) : 0;
      const robBanUntil = robCmd.caughtBan ? (robCmd.caughtBan.get(userId) || 0) : 0;
      const robExpiresAt = Math.max(robCoolUntil, robBanUntil);
      let robText = '🟢 **GOTOWE!**';
      if (jailExpiresAt > now && jailExpiresAt >= robExpiresAt) {
        robText = `⛓️ **w więzieniu** (wyjdziesz za **${msToReadable(jailExpiresAt - now)}**)`;
      } else if (robExpiresAt > now) {
        robText = `⏱️ gotowe za **${msToReadable(robExpiresAt - now)}**`;
      }

      // 5. Company cooldown
      let companyText = '❔ brak firmy (kup za pomocą `!firma kup`)';
      if (user.company) {
        const compDef = config.economy.companies[user.company.id];
        if (compDef) {
          if (user.company.isBroken) {
            companyText = `🔴 **ZEPSUTA** 🔧 (użyj: \`!firma napraw\`)`;
          } else {
            const cooldownMs = 3 * 3600 * 1000;
            const diff = now - (user.company.lastPayout || 0);
            if (diff >= cooldownMs) {
              companyText = `🟢 **GOTOWE!** (${compDef.emoji} ${compDef.name})`;
            } else {
              companyText = `⏱️ gotowe za **${msToReadable(cooldownMs - diff)}** (${compDef.emoji} ${compDef.name})`;
            }
          }
        }
      }

      return {
        jailText,
        dailyText,
        workText,
        crimeText,
        robText,
        companyText
      };
    });

    let replyText = result.jailText;
    replyText += `⏳ **Status Twoich czasów oczekiwania (cooldownów):**\n\n`;
    replyText += `📅 **!daily** — ${result.dailyText}\n`;
    replyText += `💼 **!work** — ${result.workText}\n`;
    replyText += `🔫 **!crime** — ${result.crimeText}\n`;
    replyText += `👥 **!rob** — ${result.robText}\n`;
    replyText += `🏢 **!firma zbierz** — ${result.companyText}`;

    await message.reply(replyText);
  }
};
