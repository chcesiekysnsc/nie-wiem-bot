const { msToReadable } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

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

      // 1. Daily cooldown
      const todayMidnight = getPolishMidnight(new Date(now));
      let dailyText = '🟢 **GOTOWE!**';
      if (user.lastDailyClaim && user.lastDailyClaim >= todayMidnight) {
        const tomorrowMidnight = getPolishMidnight(new Date(todayMidnight + 26 * 60 * 60 * 1000));
        dailyText = `⏱️ gotowe za **${msToReadable(tomorrowMidnight - now)}**`;
      }

      // Helper function to resolve general cooldown from store
      const getCooldownText = (cmdName) => {
        const userCooldowns = store.cooldowns.commands[userId] || {};
        const expiresAt = Number(userCooldowns[cmdName] || 0);
        if (expiresAt > now) {
          return `⏱️ gotowe za **${msToReadable(expiresAt - now)}**`;
        }
        return '🟢 **GOTOWE!**';
      };

      const workText = getCooldownText('work');
      const crimeText = getCooldownText('crime');
      const robText = getCooldownText('rob');

      // 5. Company cooldown
      let companyText = '❔ brak firmy (kup za pomocą `!firma kup`)';
      if (user.company) {
        const config = require('../config/config');
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
        dailyText,
        workText,
        crimeText,
        robText,
        companyText
      };
    });

    let replyText = `⏳ **Status Twoich czasów oczekiwania (cooldownów):**\n\n`;
    replyText += `📅 **!daily** — ${result.dailyText}\n`;
    replyText += `💼 **!work** — ${result.workText}\n`;
    replyText += `🔫 **!crime** — ${result.crimeText}\n`;
    replyText += `👥 **!rob** — ${result.robText}\n`;
    replyText += `🏢 **!firma zbierz** — ${result.companyText}`;

    await message.reply(replyText);
  }
};
