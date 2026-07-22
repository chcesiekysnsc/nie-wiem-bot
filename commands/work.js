const config = require('../config/config');
const {
  addXp,
  ensureInventoryRecord,
  formatCurrency,
  hasItem,
  msToReadable,
  randomInt,
  refreshBadges,
  getPassiveMultiplier,
  getActiveEventMultiplier,
  getGlobalIncomeMultiplier,
  getGlobalCooldownReduction,
  getCasinoWinMultiplier,
  getItemUpgradeLevel,
  getUpgradedLinearBonus,
  getUpgradedCapBonus
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { getEffectiveChance } = require('../utils/chances');
const { getGangBossShopMultiplier } = require('../utils/gangBossShop');
const { hasReputationBonus } = require('../utils/gangAI');
const { getItemSetBonus } = require('../utils/itemSets');
const { askGeminiWithFallback } = require('../commands/ai');

const staticJobs = [
  'Ogarnąłeś nocną zmianę przy stolach pokerowych.',
  'Sprzedałeś premium wejścia do strefy VIP.',
  'Połerowałeś złote żetony i dostałeś napiwek.',
  'Dopilnowałeś składu sejfu i zgarnąłeś premię.'
];

async function generateWorkFlavor(reward, finalReward, hasTribute, gangBonus) {
  try {
    const promptText =
      `Jesteś kreatywnym pisarzem humorystycznych opisów do bota kasynowego na Messengerze.\n` +
      `Napisz JEDNO zdanie w pierwszej osobie (od perspektywy gracza), opisujące co dokładnie zrobił, żeby zarobić pieniądze.\n` +
      `Styl: miejski, lekko zabawny,烘烤owany klima kasyna/ulicy, krótko.\n` +
      `Nagroda gracza: ${formatCurrency(finalReward)}${gangBonus ? ` (w tym +${gangBonus}% z biznesu gangu)` : ''}${hasTribute ? ' (odjąto haracz dla Bossa)' : ''}.\n` +
      `ZASADY:\n` +
      `- Tylko JEDNO zdanie, max 180 znaków.\n` +
      `- Nie używaj słów "bot", "komenda", "gra", "bot-a".\n` +
      `- Nie podawaj kwoty — bot już to zrobi.\n` +
      `- Nie używaj emoji.\n` +
      `- Unikaj cenzurowanych/banowalnych słów.\n` +
      `- Zachowaj klimat miejsca/bota, ale bez bezpośrednich odniesień do Messenger-a.\n` +
      `PRZYKŁADY:\n` +
      `- "Zamieniłem karty w talii, gdy dealer się odwrócił."\n` +
      `- "Nosiłem worki z żetonami z podziemia do sejfu."\n` +
      `- "Pokazałem wyborcom, gdzie stoją automaty z najwyższym wypłatami."\n` +
      `- "Sprzątałem pokój po wysokiej grze i znalazłem zostawioną tipówkę."\n\n` +
      `Napisz tylko opis, bez dodatkowych komentarzy.`;

    const aiText = await askGeminiWithFallback(promptText);
    const cleaned = String(aiText || '').trim();
    if (cleaned && cleaned.length <= 200) {
      return cleaned.replace(/^["'«»]+|["'«»]+$/g, '');
    }
  } catch (err) {
    console.error('[WORK AI] Błąd generowania opisu:', err.message);
  }

  return staticJobs[randomInt(0, staticJobs.length - 1)];
}

module.exports = {
  name: 'work',
  aliases: [],
  async execute(client, message) {
    const workLuckOverride = await getEffectiveChance(message.author.id, 'work_luck');

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);

      const now = Date.now();
      if (user.jailUntil && user.jailUntil > now) {
        const msLeft = user.jailUntil - now;
        return { error: `❌ Jesteś w więzieniu! Odzyskasz wolność za **${msToReadable(msLeft)}**.` };
      }
      const hasZegar = hasItem(inventory, 'stary_zegar');
      const hasSzwajcar = hasItem(inventory, 'szwajcarski_zegarek');
      const baseCd = config.cooldowns.work || 600;
      let actualCd = baseCd;
      if (hasZegar) {
        const level = getItemUpgradeLevel(inventory, 'stary_zegar');
        const reduction = 0.10 + level * 0.005;
        actualCd *= (1 - reduction);
      }
      if (hasSzwajcar) actualCd *= 0.85;
      const cdReduction = getGlobalCooldownReduction(inventory);
      if (cdReduction > 0) {
        actualCd = Math.floor(actualCd * (1 - cdReduction));
      }

      const evMul = getActiveEventMultiplier('cooldowns');
      if (evMul && evMul > 1) {
        actualCd = Math.floor(actualCd / evMul);
      }

      const cdMs = actualCd * 1000;
      const last = user.lastWorkTime || 0;
      const diff = now - last;

      if (diff < cdMs) {
        return { error: `⏳ Byłeś już w pracy! Wróć za **${msToReadable(cdMs - diff)}**.` };
      }

      let reward = randomInt(config.economy.workMin, config.economy.workMax);
      if (hasItem(inventory, 'vip')) {
        const level = getItemUpgradeLevel(inventory, 'vip');
        const bonus = 0.10 + level * 0.02;
        reward = Math.floor(reward * (1 + bonus));
      }

      if (Number.isFinite(workLuckOverride) && workLuckOverride !== 1) {
        reward = Math.floor(reward * workLuckOverride);
      }

      const mocnaKawaBonus = getPassiveMultiplier(inventory, 'mocna_kawa', 0.08);
      if (mocnaKawaBonus > 0) {
        reward = Math.floor(reward * (1 + mocnaKawaBonus));
      }

      const walizkaBonus = getPassiveMultiplier(inventory, 'walizka', 0.05);
      if (walizkaBonus > 0) {
        reward = Math.floor(reward * (1 + walizkaBonus));
      }

      const globalIncomeBonus = getGlobalIncomeMultiplier(inventory);
      if (globalIncomeBonus > 0) {
        reward = Math.floor(reward * (1 + globalIncomeBonus));
      }

      const setWorkBonus = getItemSetBonus(inventory, 'work_xp');
      if (setWorkBonus > 0) {
        reward = Math.floor(reward * (1 + setWorkBonus));
      }

      const tripleChance = getItemSetBonus(inventory, 'work_triple_chance');
      if (tripleChance > 0 && Math.random() < tripleChance) {
        reward = reward * 3;
      } else if (hasItem(inventory, 'rekawice_robotnika')) {
        const level = getItemUpgradeLevel(inventory, 'rekawice_robotnika');
        const chance = 0.10 + level * 0.01;
        if (Math.random() < Math.min(chance, 0.20)) {
          reward = reward * 2;
        }
      }

      if (user.badges && user.badges.includes(config.badges.krolSpamu)) {
        reward = Math.floor(reward * 1.05);
      }

      if (hasItem(inventory, 'krolewskie_insygnia')) {
        reward = Math.floor(reward * 1.10);
      }

      // Zastosuj bonus za prestiż (4% za każdy poziom prestiżu)
      let prestigeBonusPct = 0;
      if (user.prestige && user.prestige > 0) {
        prestigeBonusPct = user.prestige * 0.04;
        reward = Math.floor(reward * (1 + prestigeBonusPct));
      }

      // Zastosuj bonus gangowy: Legalne Biznesy
      let gangBonus = 0;
      if (user.gangId && store.profiles.gangs && store.profiles.gangs[user.gangId]) {
        const gang = store.profiles.gangs[user.gangId];
        const idxBiz = gang.levelBiznesy || 0;
        const multipliers = [1.0, 1.10, 1.20, 1.30];
        const multiplier = multipliers[idxBiz] || 1.0;
        if (idxBiz > 0) {
          gangBonus = [0, 10, 20, 30][idxBiz] || 0;
        }
        reward = Math.floor(reward * multiplier);

        const workshopBonus = getGangBossShopMultiplier(gang, 'work');
        if (workshopBonus > 0) {
          reward = Math.floor(reward * (1 + workshopBonus));
        }

        if (hasReputationBonus(gang, 100)) {
          reward = Math.floor(reward * 1.05);
        }

        const { getTerritoryBonus } = require('../utils/territories');
        const territoryBonus = getTerritoryBonus(gang.id, 'work');
        if (territoryBonus > 0) {
          reward = Math.floor(reward * (1 + territoryBonus));
        }
      }

      // Oblicz haracza, jeśli gracz należy do gangu
      let tributeAmount = 0;
      if (user.gangId && store.profiles.gangs && store.profiles.gangs[user.gangId]) {
        const gang = store.profiles.gangs[user.gangId];
        const tributePercent = gang.tributePercent || 0;
        const isExcluded = user.gangRole === 'boss' || user.gangRole === 'deputy';
        if (tributePercent > 0 && !isExcluded) {
          tributeAmount = Math.floor(reward * (tributePercent / 100));
          user.balance += reward - tributeAmount;
          // Dodaj haracza do sejfu gangu i do portfela Bossa
          const incomeBonus = getGangBossShopMultiplier(gang, 'income');
          gang.vault += Math.floor(tributeAmount * (1 + incomeBonus));
          const bossUser = createUser(gang.bossId, store.users);
          bossUser.balance += tributeAmount;
        } else {
          user.balance += reward;
        }
      } else {
        user.balance += reward;
      }

      user.lastWorkTime = now;
      const xpResult = addXp(user, randomInt(12, 24), inventory);
      refreshBadges(user, inventory);

      return {
        reward,
        tributeAmount,
        gangBonus,
        xpResult,
        text: staticJobs[randomInt(0, staticJobs.length - 1)]
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    let workText = result.text;
    const finalReward = result.reward - result.tributeAmount;
    const hasTribute = result.tributeAmount > 0;
    try {
      workText = await generateWorkFlavor(result.reward, finalReward, hasTribute, result.gangBonus);
    } catch (err) {
      console.error('[WORK AI] Fallback to static text:', err.message);
    }

    const bonusText = result.gangBonus ? ` (w tym **+${result.gangBonus}%** z biznesów gangu)` : '';
    let replyText = '';

    if (result.tributeAmount > 0) {
      replyText = `👷 ${workText} Zysk: **+${formatCurrency(finalReward)}**${bonusText} (pobrano **${formatCurrency(result.tributeAmount)}** haraczu dla Bossa)`;
    } else {
      replyText = `👷 ${workText} Zysk: **+${formatCurrency(finalReward)}**${bonusText}`;
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
