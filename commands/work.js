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
  getUpgradedCapBonus,
  getRandomXp
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { getEffectiveChance } = require('../utils/chances');
const { getGangBossShopMultiplier } = require('../utils/gangBossShop');
const { hasReputationBonus } = require('../utils/gangAI');
const { getItemSetBonus } = require('../utils/itemSets');
const { advanceChallenge, getActiveChallenge } = require('../utils/challenges');

const WORK_BOT_WINDOW_SIZE = 6;
const WORK_BOT_WINDOW_SIZE_FLAGGED = 5;
const WORK_BOT_BAN_MIN = 10 * 60 * 60 * 1000;
const WORK_BOT_BAN_MAX = 14 * 60 * 60 * 1000;
const WORK_BOT_MARGIN = 90;
const WORK_TIMESTAMP_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const WORK_BOT_FLAGGED_TTL_MS = 8 * 24 * 60 * 60 * 1000;
const WORK_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const WORK_MAX_TRACKED_USERS = 200;
let lastWorkCleanup = 0;

async function resolveName(client, userId) {
  if (typeof client.resolveUserName === 'function') {
    return await client.resolveUserName(userId);
  }
  return (client.userNames && client.userNames.get(userId)) || `Użytkownik_${userId.slice(-6)}`;
}

function cleanupWorkData(store, now) {
  if (now - lastWorkCleanup < WORK_CLEANUP_INTERVAL_MS) return;
  lastWorkCleanup = now;

  if (store.profiles.workTimestamps) {
    const entries = Object.entries(store.profiles.workTimestamps);
    for (const [uid, timestamps] of entries) {
      if (!Array.isArray(timestamps) || timestamps.length === 0) {
        delete store.profiles.workTimestamps[uid];
        continue;
      }
      const last = timestamps[timestamps.length - 1];
      if (now - last > WORK_TIMESTAMP_MAX_AGE_MS) {
        delete store.profiles.workTimestamps[uid];
      }
    }
    if (Object.keys(store.profiles.workTimestamps).length > WORK_MAX_TRACKED_USERS) {
      const sorted = Object.entries(store.profiles.workTimestamps)
        .sort((a, b) => (b[1][b[1].length - 1] || 0) - (a[1][a[1].length - 1] || 0));
      const toRemove = sorted.slice(WORK_MAX_TRACKED_USERS);
      for (const [uid] of toRemove) {
        delete store.profiles.workTimestamps[uid];
      }
    }
  }

  if (store.profiles.workBotFlagged) {
    for (const [uid, flaggedAt] of Object.entries(store.profiles.workBotFlagged)) {
      if (!Number.isFinite(flaggedAt) || now - flaggedAt > WORK_BOT_FLAGGED_TTL_MS) {
        delete store.profiles.workBotFlagged[uid];
      }
    }
  }

  if (store.profiles.workBotBans) {
    for (const [uid, ban] of Object.entries(store.profiles.workBotBans)) {
      if (ban && ban.until <= now) {
        delete store.profiles.workBotBans[uid];
      }
    }
  }
}

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
    const workLuckOverride = await getEffectiveChance(message.author.id, 'work_luck');
    const authorId = message.author.id;
    const now = Date.now();

    function getWorkLevelBonus(level) {
      if (level <= 1) return 2;
      if (level <= 2) return 3;
      if (level <= 3) return 4;
      if (level <= 4) return 6;
      if (level <= 5) return 7;
      if (level <= 6) return 9;
      if (level <= 7) return 10;
      if (level <= 8) return 11;
      if (level <= 9) return 13;
      if (level <= 10) return 15;
      if (level <= 11) return 16;
      if (level <= 12) return 18;
      if (level <= 13) return 20;
      if (level <= 14) return 22;
      if (level <= 15) return 24;
      if (level <= 16) return 27;
      if (level <= 17) return 30;
      if (level <= 18) return 33;
      if (level <= 19) return 36;
      return 45;
    }

    function getPromotionChance(level) {
      if (level <= 4) return 0.17;
      if (level <= 9) return 0.12;
      if (level <= 14) return 0.08;
      if (level <= 19) return 0.05;
      return 0.03;
    }

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const triggerMessages = [];

      // Inicjalizuj workTimestamps w profiles jeśli nie istnieje
      if (!store.profiles.workTimestamps || typeof store.profiles.workTimestamps !== 'object') {
        store.profiles.workTimestamps = {};
      }

      // Wyczyść wygasłe bany
      if (store.profiles.workBotBans) {
        for (const uid of Object.keys(store.profiles.workBotBans)) {
          if (store.profiles.workBotBans[uid].until <= now) {
            delete store.profiles.workBotBans[uid];
          }
        }
      }

      const activeBan = store.profiles.workBotBans && store.profiles.workBotBans[message.author.id];
      if (activeBan && activeBan.until > now) {
        return { error: 'ze względu na zautomatyzowane używanie work odebrano ci dostęp do tej komendy na jakiś czas. Jeśli uważasz, że ban jest niesłuszny, napisz !odwolanie <treść>' };
      }

      cleanupWorkData(store, now);

      if (user.jailUntil && user.jailUntil > now) {
        const msLeft = user.jailUntil - now;
        return { error: `❌ Jesteś w więzieniu! Odzyskasz wolność za **${msToReadable(msLeft)}**.` };
      }

      const hasZegar = hasItem(inventory, 'stary_zegar');
      const hasSzwajcar = hasItem(inventory, 'szwajcarski_zegarek');
      const hasEnergetyk = hasItem(inventory, 'energetyk');
      const hasAutomat = hasItem(inventory, 'automat_do_kawy');
      const baseCd = config.cooldowns.work || 600;
      let actualCd = baseCd;
      if (hasZegar) {
        const level = getItemUpgradeLevel(inventory, 'stary_zegar');
        const reduction = 0.10 + level * 0.005;
        actualCd *= (1 - reduction);
      }
      if (hasSzwajcar) actualCd *= 0.85;
      
      // Energetyk zwiększa cooldown o 10%
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

      if (hasAutomat) {
        actualCd = Math.floor(actualCd * 0.95);
      }

      const cdMs = actualCd * 1000;
      const last = user.lastWorkTime || 0;
      const diff = now - last;

      if (diff < cdMs) {
        return { error: `⏳ Byłeś już w pracy! Wróć za **${msToReadable(cdMs - diff)}**.` };
      }

      const workLevel = Math.max(1, user.workLevel || 1);
      const workLevelBonus = 1 + getWorkLevelBonus(workLevel) / 100;
      let promotedWorkLevel = false;
      let promotedNewWorkLevel = user.workLevel || 1;

      let reward = randomInt(config.economy.workMin, config.economy.workMax);
      reward = Math.floor(reward * workLevelBonus);

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

      const energetykBonus = getPassiveMultiplier(inventory, 'energetyk', 0.05);
      if (energetykBonus > 0) {
        reward = Math.floor(reward * (1 + energetykBonus));
      }

      const globalIncomeBonus = getGlobalIncomeMultiplier(inventory);
      if (globalIncomeBonus > 0) {
        reward = Math.floor(reward * (1 + globalIncomeBonus));
      }

      const setWorkBonus = getItemSetBonus(inventory, 'work_xp');
      if (setWorkBonus > 0) {
        reward = Math.floor(reward * (1 + setWorkBonus));
      }

      const automatBonus = getPassiveMultiplier(inventory, 'automat_do_kawy', 0.04);
      if (automatBonus > 0) {
        reward = Math.floor(reward * (1 + automatBonus));
      }

      const drukarkaBonus = getPassiveMultiplier(inventory, 'drukarka_pieniedzy', 0.05);
      if (drukarkaBonus > 0) {
        reward = Math.floor(reward * (1 + drukarkaBonus));
      }

      const workIncomeBonus = getItemSetBonus(inventory, 'work_income');
      if (workIncomeBonus > 0) {
        reward = Math.floor(reward * (1 + workIncomeBonus));
      }

      const tripleChance = getItemSetBonus(inventory, 'work_triple_chance');
      if (tripleChance > 0 && Math.random() < tripleChance) {
        reward = reward * 3;
        triggerMessages.push('🍀 **Potrójna wypłata!** Zestaw przedmiotów potroił Twój zysk!');
      } else if (hasItem(inventory, 'rekawice_robotnika')) {
        const level = getItemUpgradeLevel(inventory, 'rekawice_robotnika');
        const chance = 0.10 + level * 0.01;
        if (Math.random() < Math.min(chance, 0.20)) {
          reward = reward * 2;
          triggerMessages.push(`🧤 **Podwójna wypłata!** Rękawice Robotnika (+${level}) podwoiły Twój zysk!`);
        }
      }

      // Szansa na awans: bazowa + bonusy z przedmiotów, jedna próba
      if (!user.workLevel) user.workLevel = 1;
      const currentLevel = user.workLevel;
      const promotionBonus = getItemSetBonus(inventory, 'work_promotion_chance');
      const kursBonus = getPassiveMultiplier(inventory, 'kurs_kwalifikacji', 0.03);
      const totalPromotionChance = getPromotionChance(currentLevel) + promotionBonus + kursBonus;
      if (Math.random() < totalPromotionChance) {
        user.workLevel++;
        promotedWorkLevel = true;
        promotedNewWorkLevel = user.workLevel;
      }

      if (user.badges && user.badges.includes(config.badges.krolSpamu)) {
        reward = Math.floor(reward * 1.05);
      }

      if (hasItem(inventory, 'krolewskie_insygnia')) {
        reward = Math.floor(reward * 1.10);
      }

      // Bonus mieszkaniowy (warsztat + tier domu)
      const { getHouseWorkBonus } = require('../utils/economy');
      const houseWorkBonus = getHouseWorkBonus(user);
      if (houseWorkBonus > 0) {
        reward = Math.floor(reward * (1 + houseWorkBonus));
      }

      let prestigeBonusPct = 0;
      if (user.prestige && user.prestige > 0) {
        prestigeBonusPct = user.prestige * 0.04;
        reward = Math.floor(reward * (1 + prestigeBonusPct));
      }

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

      if (user.workBoostUntil && now < user.workBoostUntil && Number(user.workBoostPercent) > 0) {
        reward = Math.floor(reward * (1 + Number(user.workBoostPercent) / 100));
      }

      let eventMessage;
      let doubleXp = false;
      const forcedEvent = store.profiles.forcedWorkEvent && store.profiles.forcedWorkEvent[authorId];
      if (forcedEvent) {
        delete store.profiles.forcedWorkEvent[authorId];
        if (forcedEvent === 1) {
          reward = Math.floor(reward * 1.5);
          eventMessage = '🎉 Szef był w dobrym nastroju — dostałeś premię **+50%** do nagrody!';
        } else if (forcedEvent === 2) {
          reward = Math.floor(reward * 0.7);
          user.tempCooldownReductionUntil = now + 60 * 60 * 1000;
          eventMessage = '⚠️ Potknąłeś się w pracy i straciłeś **-30%** nagrody, ale szef dał Ci plaster — przez następną godzinę cooldown pracy jest skrócony o **20%**!';
        } else if (forcedEvent === 3) {
          const newBoost = Math.min(50, Number(user.workBoostPercent || 0) + 10);
          user.workBoostUntil = now + 6 * 60 * 60 * 1000;
          user.workBoostPercent = Number(newBoost);
          eventMessage = `💸 Szef dał Ci podwyżkę! Przez następne **6h** wszystkie prace są opłacane o **${newBoost}%** więcej.`;
        } else if (forcedEvent === 4) {
          doubleXp = true;
          eventMessage = '⭐ Szef zauważył Twój talent! Zdobywasz **podwójne XP** z tej pracy!';
        }
      } else {
        const EVENT_CHANCE = 0.02;
        if (Math.random() < EVENT_CHANCE) {
          const roll = Math.random();
          if (roll < 0.35) {
              reward = Math.floor(reward * 1.5);
              eventMessage = '🎉 Szef był w dobrym nastroju — dostałeś premię **+50%** do nagrody!';
            } else if (roll < 0.60) {
              reward = Math.floor(reward * 0.7);
              user.tempCooldownReductionUntil = now + 60 * 60 * 1000;
              eventMessage = '⚠️ Potknąłeś się w pracy i straciłeś **-30%** nagrody, ale szef dał Ci plaster — przez następną godzinę cooldown pracy jest skrócony o **20%**!';
            } else if (roll < 0.75) {
              const newBoost = Math.min(50, Number(user.workBoostPercent || 0) + 10);
              user.workBoostUntil = now + 6 * 60 * 60 * 1000;
              user.workBoostPercent = Number(newBoost);
              eventMessage = `💸 Szef dał Ci podwyżkę! Przez następne **6h** wszystkie prace są opłacane o **${newBoost}%** więcej.`;
            } else {
              doubleXp = true;
              eventMessage = '⭐ Szef zauważył Twój talent! Zdobywasz **podwójne XP** z tej pracy!';
            }
        }
      }

      let tributeAmount = 0;
      if (user.gangId && store.profiles.gangs && store.profiles.gangs[user.gangId]) {
        const gang = store.profiles.gangs[user.gangId];
        const tributePercent = gang.tributePercent || 0;
        const isExcluded = user.gangRole === 'boss' || user.gangRole === 'deputy';
        if (tributePercent > 0 && !isExcluded) {
          tributeAmount = Math.floor(reward * (tributePercent / 100));
          user.balance += reward - tributeAmount;
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

      const xpGain = getRandomXp();
      const xpBonus = getItemSetBonus(inventory, 'xp_gain');
      const finalXpGain = xpBonus > 0 ? Math.floor(xpGain * (1 + xpBonus)) : xpGain;
      const xpResult = addXp(user, finalXpGain, inventory);
      const leveledUpWork = xpResult.leveledUp;

      const xpDoubleChance = getItemSetBonus(inventory, 'xp_double_chance');
      if (xpDoubleChance > 0 && Math.random() < xpDoubleChance) {
        const bonusXp = getRandomXp();
        const bonusXpResult = addXp(user, bonusXp, inventory);
        triggerMessages.push('⚡ **Podwójny XP!** Zestaw przedmiotów dał Ci dodatkowe punkty doświadczenia!');
        if (bonusXpResult.leveledUp && !leveledUpWork) {
          // message.reply already sent below if needed
        }
      }

      user.lastWorkTime = now;

      if (hasAutomat) {
        user.automatDoKawyUses = (user.automatDoKawyUses || 0) + 1;
        if (user.automatDoKawyUses >= 25) {
          removeItem(inventory, 'automat_do_kawy', 1);
          user.automatDoKawyUses = 0;
        }
      }

      const flaggedAt = store.profiles.workBotFlagged && store.profiles.workBotFlagged[authorId];
      const isFlagged = Number.isFinite(flaggedAt) && (now - flaggedAt < WORK_BOT_FLAGGED_TTL_MS);
      const windowSize = isFlagged ? WORK_BOT_WINDOW_SIZE_FLAGGED : WORK_BOT_WINDOW_SIZE;

      const disabledCommands = new Set(store.profiles.disabledCommands || []);
      const userOverrides = (store.profiles.userCommandPermissions || {})[authorId] || {};
      const workDisabledForUser = userOverrides.work === false || disabledCommands.has('work');

      const activeWorkChallenge = getActiveChallenge(authorId, store);
      const hasWorkChallenge = activeWorkChallenge && activeWorkChallenge.type === 'work_count';

      const timestamps = Array.isArray(store.profiles.workTimestamps[authorId])
        ? store.profiles.workTimestamps[authorId]
        : [];
      
      if (!workDisabledForUser && !hasWorkChallenge) {
        timestamps.push(now);
        while (timestamps.length > windowSize) {
          timestamps.shift();
        }
        store.profiles.workTimestamps[authorId] = timestamps;
      }

      let botBanTriggered = false;
      let botBanUntil = null;
      let botPattern = null;

      if (timestamps.length === windowSize && !workDisabledForUser && !hasWorkChallenge) {
        const diffs = [];
        for (let i = 1; i < timestamps.length; i++) {
          diffs.push((timestamps[i] - timestamps[i - 1]) / 1000);
        }

        const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        const margin = 90;
        const allRegular = diffs.every(d => d >= avg - margin && d <= avg + margin);

        if (allRegular) {
          const banDuration = randomInt(WORK_BOT_BAN_MIN, WORK_BOT_BAN_MAX);
          botBanUntil = now + banDuration;
          botPattern = 'regular';

          store.profiles.workBotBans = store.profiles.workBotBans || {};
          store.profiles.workBotBans[authorId] = {
            until: botBanUntil,
            pattern: botPattern,
            bannedAt: now
          };

          store.profiles.workBotFlagged = store.profiles.workBotFlagged || {};
          store.profiles.workBotFlagged[authorId] = now;

          delete store.profiles.workTimestamps[authorId];

          botBanTriggered = true;
        }
      }

      const challengeUpdate = advanceChallenge(authorId, store, 'work_count');

      return {
        reward,
        tributeAmount,
        gangBonus,
        xpResult,
        text: jobs[randomInt(0, jobs.length - 1)],
        workLevel,
        leveledUpWork,
        newWorkLevel: user.workLevel,
        promotedWorkLevel,
        promotedNewWorkLevel,
        eventMessage,
        triggerMessage: triggerMessages.join('\n'),
        workBoostActive: !!(user.workBoostUntil && now < user.workBoostUntil),
        workBoostPercent: user.workBoostPercent || 0,
        workBoostUntil: user.workBoostUntil || 0,
        botBanTriggered,
        botBanUntil,
        botPattern,
        challengeUpdate
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    if (result.botBanTriggered) {
      const userName = await resolveName(client, authorId);
      const adminGroupId = config.adminGroupId || '5277347745703557';
      const banHours = Math.round((result.botBanUntil - now) / (60 * 60 * 1000));
      const patternLabel = 'regular ±1.5 min';
      const notifyMsg = `🚨 **Wykryto automatyczne używanie !work**\nUżytkownik: **${userName}** (${authorId})\nKara: ban na !work przez **${banHours}h**\nWzorzec: ${patternLabel} między wykonaniami`;

      if (client.api && adminGroupId) {
        client.api.sendMessage(notifyMsg, adminGroupId);
      }
    }

    const bonusText = result.gangBonus ? ` (w tym **+${result.gangBonus}%** z biznesów gangu)` : '';
    const finalReward = result.reward - result.tributeAmount;
    let replyText = '';

    if (result.promotedWorkLevel) {
      const workTitle = result.promotedNewWorkLevel <= 4 ? 'Praktykant' : result.promotedNewWorkLevel <= 9 ? 'Specjalista' : result.promotedNewWorkLevel <= 14 ? 'Ekspert' : result.promotedNewWorkLevel <= 19 ? 'Mistrz' : 'Legenda Pracy';
      replyText += `\n📈 **AWANS PRACY!** Jesteś teraz **${workTitle}** (poziom **${result.promotedNewWorkLevel}**)!`;
    }

    if ((result.workLevel > 1 || result.leveledUpWork) && !result.promotedWorkLevel) {
      const workTitle = result.workLevel <= 4 ? 'Praktykant' : result.workLevel <= 9 ? 'Specjalista' : result.workLevel <= 14 ? 'Ekspert' : result.workLevel <= 19 ? 'Mistrz' : 'Legenda Pracy';
      const levelText = result.leveledUpWork
        ? `\n📈 **AWANS PRACY!** Jesteś teraz **${workTitle}** (poziom **${result.newWorkLevel}**)!`
        : `\n💼 Twoja ranga: **${workTitle}** (poziom **${result.workLevel}**)`;
      replyText += levelText;
    }

    if (result.tributeAmount > 0) {
      replyText += `\n👷 ${result.text} Zysk: **+${formatCurrency(finalReward)}**${bonusText} (pobrano **${formatCurrency(result.tributeAmount)}** haraczu dla Bossa)`;
    } else {
      replyText += `\n👷 ${result.text} Zysk: **+${formatCurrency(finalReward)}**${bonusText}`;
    }

    if (result.eventMessage) {
      replyText += `\n${result.eventMessage}`;
    }

    if (result.triggerMessage) {
      replyText += `\n${result.triggerMessage}`;
    }

    if (result.workBoostActive) {
      replyText += `\n🚀 Aktywna podwyżka pracy: **+${result.workBoostPercent}%** (pozostało: **${msToReadable(result.workBoostUntil - Date.now())}**)`;
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
