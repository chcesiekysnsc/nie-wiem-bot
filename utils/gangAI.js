const config = require('../config/config');
const { withData, createUser, loadData } = require('./storage');
const { randomInt, formatCurrency } = require('./economy');
const { getGangBossShopMultiplier, attemptStealBossItem, getItemName, getItemEmoji, getAllCrateDefinitions, processBossShopPurchase, ensureDailyLimit } = require('./gangBossShop');

function getPolandHour(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    hour: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const hourPart = parts.find(p => p.type === 'hour');
  return hourPart ? parseInt(hourPart.value, 10) : NaN;
}

function generateGangName(cfg) {
  const parts = (cfg && cfg.nameParts) ? cfg.nameParts : { adjectives: [], nouns: [], suffixes: [] };
  const adjectives = parts.adjectives || [];
  const nouns = parts.nouns || [];
  const suffixes = parts.suffixes || [];
  let name = '';
  let attempts = 0;
  do {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    if (suffixes.length > 0 && Math.random() < 0.5) {
      const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
      name = `${adj} ${noun} ${suffix}`;
    } else {
      name = `${adj} ${noun}`;
    }
    attempts++;
    if (attempts > 50) {
      name = `${adj}${noun}${Math.floor(Math.random() * 999)}`;
      break;
    }
  } while (false);

  const gangId = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return { name, gangId };
}

function generateFakeUsers(gangId, count) {
  const fakeNames = (config.gangAI && config.gangAI.fakeNames) || { first: [], last: [] };
  const firstNames = fakeNames.first || [];
  const lastNames = fakeNames.last || [];
  const users = {};
  const bossId = `ai_${gangId}_boss`;

  const pickFirst = () => firstNames[Math.floor(Math.random() * firstNames.length)];
  const pickLast = () => lastNames[Math.floor(Math.random() * lastNames.length)];

  users[bossId] = {
    isAI: true,
    name: `${pickFirst()} ${pickLast()}`,
    gangId,
    gangRole: 'boss',
    balance: 0,
    bank: 0,
    level: Math.floor(Math.random() * 30) + 1,
    xp: 0,
    totalWon: 0,
    totalLost: 0,
    gamesPlayed: Math.floor(Math.random() * 500),
    wins: 0,
    losses: 0,
    commandsUsed: Math.floor(Math.random() * 2000) + 100,
    lastActiveThreadId: null,
    prestige: 0,
    badges: [],
    marriedTo: null,
    dailyCooldown: 0,
    messageCount: Math.floor(Math.random() * 5000),
    groupMessages: {},
    commandCounts: {},
    company: null,
    defaultCity: null,
    openedPackagesToday: 0,
    lastPackageOpenDate: null
  };

  const memberCount = Math.max(1, Math.min(count, 3));
  for (let i = 1; i <= memberCount; i++) {
    const memberId = `ai_${gangId}_m${i}`;
    users[memberId] = {
      isAI: true,
      name: `${pickFirst()} ${pickLast()}`,
      gangId,
      gangRole: 'member',
      balance: Math.floor(Math.random() * 500000),
      bank: Math.floor(Math.random() * 200000),
      level: Math.floor(Math.random() * 25) + 1,
      xp: 0,
      totalWon: 0,
      totalLost: 0,
      gamesPlayed: Math.floor(Math.random() * 300),
      wins: 0,
      losses: 0,
      commandsUsed: Math.floor(Math.random() * 1000) + 50,
      lastActiveThreadId: null,
      prestige: 0,
      badges: [],
      marriedTo: null,
      dailyCooldown: 0,
      messageCount: Math.floor(Math.random() * 2000),
      groupMessages: {},
      commandCounts: {},
      company: null,
      defaultCity: null,
      openedPackagesToday: 0,
      lastPackageOpenDate: null
    };
  }

  return users;
}

function pickPersonality() {
  const personalities = Object.keys((config.gangAI && config.gangAI.personalities) || {});
  if (personalities.length === 0) return 'zbalansowany';
  return personalities[Math.floor(Math.random() * personalities.length)];
}

async function scoreActions(gang, cfg, allGangs) {
  const scores = {};
  const gangId = gang.id || gang.gangId;
  const vault = gang.vault || 0;
  const cap = getVaultCap();

  scores.earn = 10 + (1 - vault / cap) * 15;

  const priority = getUpgradePriority(gang);
  const upgrades = {
    dziupla: { max: 10, costs: Array.from({ length: 10 }, (_, i) => 100000 + i * 40000) },
    biznesy: { max: 3, costs: [200000, 400000, 650000] },
    fach: { max: 3, costs: [200000, 350000, 600000] }
  };
  let bestUpgradeScore = 0;
  for (const key of priority) {
    const levelKey = key === 'dziupla' ? 'levelDziupla' : key === 'biznesy' ? 'levelBiznesy' : 'levelFach';
    const currentLevel = gang[levelKey] || 0;
    const def = upgrades[key];
    if (currentLevel >= def.max) continue;
    const cost = def.costs[currentLevel];
    if (vault < cost) continue;
    const affordabilityRatio = 1 - (cost / Math.max(vault, 1));
    const priorityBonus = key === priority[0] ? 15 : key === priority[1] ? 8 : 0;
    const score = 20 + affordabilityRatio * 20 + priorityBonus;
    if (score > bestUpgradeScore) bestUpgradeScore = score;
  }
  scores.upgrade = bestUpgradeScore;

  const maxMembers = 5 + (gang.levelDziupla || 0);
  const currentMembers = (gang.members || []).length;
  scores.recruit = currentMembers < maxMembers && vault > 50000
    ? 15 + (1 - currentMembers / maxMembers) * 15
    : 0;

  if (isAttackHour() && vault >= 500000) {
    const costRatio = (cfg && cfg.attackVaultCostRatio) || 0.10;
    const cost = Math.floor(vault * costRatio);
    if (vault - cost >= getMinVaultAfterAttack()) {
      const candidates = Object.entries(allGangs).filter(([id, g]) => {
        if (id === gangId) return false;
        if ((g.alliances || []).includes(gangId)) return false;
        if ((g.shieldUntil || 0) > Date.now()) return false;
        return true;
      });
      let bestTargetScore = 0;
      for (const [, target] of candidates) {
        const targetVault = target.vault || 0;
        if (targetVault < 100000) continue;
        const myPowerEstimate = 30 * currentMembers * (1 + 0.15 * (gang.levelFach || 0));
        const theirDefenseEstimate = 30 * (target.members || []).length * (1 + 0.15 * (target.levelFach || 0));
        const winOdds = theirDefenseEstimate > 0 ? myPowerEstimate / (myPowerEstimate + theirDefenseEstimate) : 0.9;
        const potentialLoot = targetVault * 0.25 * 0.7;
        const expectedValue = winOdds * potentialLoot - (1 - winOdds) * (vault * 0.35);
        const attackBias = getAttackWeight(gang);
        const targetScore = (expectedValue / 10000) * attackBias;
        if (targetScore > bestTargetScore) bestTargetScore = targetScore;
      }
      scores.attack = bestTargetScore;
    } else {
      scores.attack = 0;
    }
  } else {
    scores.attack = 0;
  }

  const maxAlliances = (cfg && cfg.maxAlliances) || 3;
  scores.alliance = (gang.alliances || []).length < maxAlliances ? 12 : 0;

  const { getAllCrateDefinitions, ensureDailyLimit } = require('./gangBossShop');
  const crates = getAllCrateDefinitions();
  const cheapestPrice = Math.min(...Object.values(crates).map(c => c.price));
  if (vault >= cheapestPrice * 2) {
    const limitCheck = await ensureDailyLimit(gang, 1);
    scores.buyBossCrate = limitCheck.allowed ? 18 + (vault / cap) * 10 : 0;
  } else {
    scores.buyBossCrate = 0;
  }

  scores.event = 5;

  return scores;
}

function pickBestAction(scores) {
  let bestAction = 'earn';
  let bestScore = -Infinity;
  for (const [action, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }
  return bestAction;
}

function getFixedActionIntervalMs() {
  const minutes = (config.gangAI && config.gangAI.fixedActionIntervalMinutes) || 45;
  return minutes * 60 * 1000;
}

function getUpgradePriority(gang) {
  const personalities = (config.gangAI && config.gangAI.personalities) || {};
  const p = personalities[gang.aiPersonality] || personalities['zbalansowany'] || { upgradePriority: ['dziupla', 'biznesy', 'fach'] };
  return p.upgradePriority || ['dziupla', 'biznesy', 'fach'];
}

function getAttackWeight(gang) {
  const personalities = (config.gangAI && config.gangAI.personalities) || {};
  const p = personalities[gang.aiPersonality] || personalities['zbalansowany'] || { attackWeight: 1.0 };
  return p.attackWeight || 1.0;
}

function getVaultCap() {
  return (config.gangAI && config.gangAI.maxVault) || 5000000;
}

function getMinVaultAfterAttack() {
  return (config.gangAI && config.gangAI.minVaultAfterAttack) || 100000;
}

function getFixedActionIntervalMs() {
  const minutes = (config.gangAI && config.gangAI.fixedActionIntervalMinutes) || 45;
  return minutes * 60 * 1000;
}

function isAttackHour() {
  const hour = getPolandHour(new Date());
  const start = (config.gangAI && config.gangAI.attackTimeStartHour) || 8;
  const end = (config.gangAI && config.gangAI.attackTimeEndHour) || 22;
  return hour >= start && hour < end;
}

function randomParticipants(members) {
  const arr = Array.isArray(members) ? members : [];
  if (arr.length === 0) return 0;
  const min = Math.max(1, Math.ceil(arr.length * ((config.gangAI && config.gangAI.participantRatioMin) || 0.4)));
  const max = Math.max(min, Math.floor(arr.length * ((config.gangAI && config.gangAI.participantRatioMax) || 1.0)));
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function calcPower(participantCount, levelFach) {
  let base = 0;
  for (let i = 0; i < participantCount; i++) {
    base += randomInt(10, 50);
  }
  return Math.floor(base * (1 + 0.15 * (levelFach || 0)));
}

function resolveWar(attackerGang, defenderGang, attackerParticipants, defenderParticipants) {
  const attBonus = getGangBossShopMultiplier(attackerGang, 'attack');
  const defBonus = getGangBossShopMultiplier(defenderGang, 'defense');
  const attackPower = calcPower(attackerParticipants, attackerGang.levelFach) * (1 + attBonus);
  const defensePower = defenderParticipants > 0 ? calcPower(defenderParticipants, defenderGang.levelFach) * (1 + defBonus) : 0;
  const winChance = defensePower > 0 ? attackPower / (attackPower + defensePower) : 0.95;
  const success = Math.random() < winChance;

  const attackerVaultBefore = attackerGang.vault || 0;
  const defenderVaultBefore = defenderGang.vault || 0;

  let stolenTotal = 0;
  let vaultShare = 0;
  let sharePerPerson = 0;
  let penaltyVault = 0;
  let penaltyDefenders = 0;
  let sharePerDefender = 0;
  let totalPenalty = 0;
  let stolenItemId = null;

  if (success) {
    const pct = randomInt(15, 35) / 100;
    stolenTotal = Math.floor(defenderVaultBefore * pct);
    const lootMult = 1 + getGangBossShopMultiplier(attackerGang, 'loot');
    vaultShare = Math.floor(stolenTotal * 0.30 * lootMult);
    const membersTotalShare = stolenTotal - vaultShare;
    sharePerPerson = attackerParticipants > 0 ? Math.floor(membersTotalShare / attackerParticipants) : 0;

    stolenItemId = attemptStealBossItem(attackerGang, defenderGang);
  } else {
    penaltyVault = Math.floor(attackerVaultBefore * 0.20);
    penaltyDefenders = Math.floor(attackerVaultBefore * 0.15);
    totalPenalty = penaltyVault + penaltyDefenders;
    if (defenderParticipants > 0) {
      sharePerDefender = Math.floor(penaltyDefenders / defenderParticipants);
    }

    stolenItemId = attemptStealBossItem(defenderGang, attackerGang);
  }

  return {
    success,
    attackPower: Math.floor(attackPower),
    defensePower: Math.floor(defensePower),
    winChance,
    stolenTotal,
    vaultShare,
    sharePerPerson,
    penaltyVault,
    penaltyDefenders,
    sharePerDefender,
    totalPenalty,
    stolenItemId
  };
}

function notifySupportThreads(client, heist, msg) {
  if (!client.api || !heist || !Array.isArray(heist.supportThreads)) return;
  for (const threadId of heist.supportThreads) {
    if (threadId && threadId !== heist.originThreadId) {
      try {
        client.api.sendMessage(msg, threadId);
      } catch (err) {
        console.error('[GANG-AI] Błąd powiadomienia grupy wsparcia:', err);
      }
    }
  }
}

async function executeEarn(gang, cfg) {
  const cap = getVaultCap();
  const earnAmount = Math.floor(Math.random() * 150000) + 20000;
  gang.vault = Math.min(cap, gang.vault + earnAmount);
  return { type: 'earn', amount: Math.min(earnAmount, cap - (gang.vault - earnAmount)) };
}

async function executeUpgrade(gang, cfg) {
  const priority = getUpgradePriority(gang);
  const upgrades = [
    { key: 'dziupla', max: 10, costs: Array.from({ length: 10 }, (_, i) => 100000 + i * 40000) },
    { key: 'biznesy', max: 3, costs: [200000, 400000, 650000] },
    { key: 'fach', max: 3, costs: [200000, 350000, 600000] }
  ];

  const upgradeMap = { dziupla: 'levelDziupla', biznesy: 'levelBiznesy', fach: 'levelFach' };

  for (const key of priority) {
    const def = upgrades.find(u => u.key === key);
    if (!def) continue;
    const currentLevel = gang[upgradeMap[key]] || 0;
    if (currentLevel >= def.max) continue;
    const cost = def.costs[currentLevel];
    if (gang.vault < cost) continue;
    gang.vault -= cost;
    gang[upgradeMap[key]] = currentLevel + 1;
    return { type: 'upgrade', upgrade: key, newLevel: currentLevel + 1, cost };
  }

  return { type: 'upgrade', skipped: true };
}

async function executeRecruit(gang, cfg) {
  const maxMembers = 5 + (gang.levelDziupla || 0);
  const currentMembers = Array.isArray(gang.members) ? gang.members.filter(m => String(m).startsWith('ai_')) : [];
  if (currentMembers.length >= maxMembers) {
    return { type: 'recruit', skipped: true };
  }

  const newId = `ai_${gang.id || gang.gangId}_m${Date.now()}_${Math.floor(Math.random() * 999)}`;
  const fakeNames = (config.gangAI && config.gangAI.fakeNames) || { first: [], last: [] };
  const firstNames = fakeNames.first || [];
  const lastNames = fakeNames.last || [];
  const pickFirst = () => firstNames[Math.floor(Math.random() * firstNames.length)];
  const pickLast = () => lastNames[Math.floor(Math.random() * lastNames.length)];
  const fakeUser = {
    isAI: true,
    name: `${pickFirst()} ${pickLast()}`,
    gangId: gang.id || gang.gangId,
    gangRole: 'member',
    balance: Math.floor(Math.random() * 200000),
    bank: Math.floor(Math.random() * 100000),
    level: Math.floor(Math.random() * 20) + 1,
    xp: 0,
    totalWon: 0,
    totalLost: 0,
    gamesPlayed: Math.floor(Math.random() * 200),
    wins: 0,
    losses: 0,
    commandsUsed: Math.floor(Math.random() * 500) + 20,
    lastActiveThreadId: null,
    prestige: 0,
    badges: [],
    marriedTo: null,
    dailyCooldown: 0,
    messageCount: Math.floor(Math.random() * 1000),
    groupMessages: {},
    commandCounts: {},
    company: null,
    defaultCity: null,
    openedPackagesToday: 0,
    lastPackageOpenDate: null
  };

  await withData(store => {
    const g = (store.profiles.gangs || {})[gang.id || gang.gangId];
    if (!g) return;
    g.members = g.members || [];
    g.members.push(newId);
    store.users[newId] = fakeUser;
  });

  return { type: 'recruit', memberId: newId, memberName: fakeUser.name };
}

async function executeAttack(gang, cfg, client, forcedTargetGangId) {
  if (!isAttackHour()) {
    return { type: 'attack', skipped: true, reason: 'outside_hours' };
  }

  const cap = getVaultCap();
  const minVaultAfter = getMinVaultAfterAttack();
  const costRatio = (config.gangAI && config.gangAI.attackVaultCostRatio) || 0.10;
  const cost = Math.floor((gang.vault || 0) * costRatio);
  if ((gang.vault || 0) < 500000 || (gang.vault || 0) - cost < minVaultAfter) {
    return { type: 'attack', skipped: true, reason: 'insufficient_vault' };
  }

  const allGangs = await withData(store => (store.profiles.gangs || {}));
  const gangId = gang.id || gang.gangId;
  const possibleTargets = Object.entries(allGangs)
    .filter(([id, g]) => id !== gangId && !g.isAI === false || !g.isAI)
    .filter(([id, g]) => {
      if (g.alliances && g.alliances.includes(gangId)) return false;
      return true;
    });

  let targetGangId = null;
  let targetGang = null;

  if (forcedTargetGangId) {
    const forced = possibleTargets.find(([id]) => id === forcedTargetGangId);
    if (forced) {
      [targetGangId, targetGang] = forced;
    } else {
      return { type: 'attack', skipped: true, reason: 'invalid_forced_target' };
    }
  } else {
    const aiGangs = possibleTargets.filter(([, g]) => g.isAI);
    const playerGangs = possibleTargets.filter(([, g]) => !g.isAI);
    const aiWeight = (cfg && cfg.attackAiWeight) || 1;
    const playerWeight = (cfg && cfg.attackPlayerWeight) || 1;
    const totalWeight = aiGangs.length * aiWeight + playerGangs.length * playerWeight;

    if (totalWeight > 0 && possibleTargets.length > 0) {
      let roll = Math.random() * totalWeight;
      const pickFrom = (arr, w) => {
        for (const [id, g] of arr) {
          roll -= w;
          if (roll <= 0) return [id, g];
        }
        return arr[0];
      };

      if (aiGangs.length > 0 && playerGangs.length > 0) {
        if (roll < aiWeight * aiGangs.length) {
          [targetGangId, targetGang] = pickFrom(aiGangs, aiWeight);
        } else {
          [targetGangId, targetGang] = pickFrom(playerGangs, playerWeight);
        }
      } else if (aiGangs.length > 0) {
        [targetGangId, targetGang] = pickFrom(aiGangs, aiWeight);
      } else {
        [targetGangId, targetGang] = pickFrom(playerGangs, playerWeight);
      }
    }
  }

  if (!targetGangId || !targetGang) {
    return { type: 'attack', skipped: true, reason: 'no_target' };
  }

  const now = Date.now();
  const defenderShield = targetGang.shieldUntil || 0;
  if (now < defenderShield) {
    return { type: 'attack', skipped: true, reason: 'shielded' };
  }

  const attackerMembers = Array.isArray(gang.members) ? gang.members : [];
  const attackerCount = randomParticipants(attackerMembers);
  const attackerParticipants = attackerMembers.slice(0, attackerCount);
  const defenderMembers = Array.isArray(targetGang.members) ? targetGang.members : [];
  const defenderCount = randomParticipants(defenderMembers);
  const defenderParticipants = defenderMembers.slice(0, defenderCount);

  await withData(store => {
    const attacker = (store.profiles.gangs || {})[gangId];
    const defender = (store.profiles.gangs || {})[targetGangId];
    if (!attacker || !defender) return;

    attacker.vault = Math.max(0, (attacker.vault || 0) - cost);
    attacker.lastAttackTime = now;
    defender.shieldUntil = now + 6 * 60 * 60 * 1000;
  });

  gang.vault = Math.max(0, (gang.vault || 0) - cost);
  gang.lastAttackTime = now;

  const warKey = `ai_${gangId}_${Date.now()}`;
  const activeThreads = Array.from(client.activeThreadIds || []);
  const defenderMembersForThread = targetGang.members || [];
  let originThreadId = null;
  let maxMemberCount = 0;

  for (const threadId of activeThreads) {
    let count = 0;
    for (const mid of defenderMembersForThread) {
      const member = await withData(store => store.users[mid]);
      if (member && member.lastActiveThreadId === threadId) count++;
    }
    if (count > maxMemberCount) {
      maxMemberCount = count;
      originThreadId = threadId;
    }
  }

  if (!originThreadId && activeThreads.length > 0) {
    originThreadId = activeThreads[0];
  }

  if (!client.activeGangWars) client.activeGangWars = new Map();
  client.activeGangWars.set(warKey, {
    initiatorId: gang.bossId,
    defenderGangId: targetGangId,
    attackers: new Set(attackerParticipants),
    defenders: new Set(defenderParticipants),
    endTime: now + 120000,
    originThreadId,
    supportThreads: [],
    isAI: true,
    aiAttackerGangId: gangId
  });

  const attackerNames = [];
  for (const pid of attackerParticipants) {
    const user = await withData(store => store.users[pid]);
    const name = (user && user.name) || `Użytkownik_${String(pid).slice(-6)}`;
    attackerNames.push(name);
  }

  const defenderNames = [];
  for (const pid of defenderParticipants) {
    const user = await withData(store => store.users[pid]);
    const name = (user && user.name) || `Użytkownik_${String(pid).slice(-6)}`;
    defenderNames.push(name);
  }

  const attackerTagsString = attackerNames.map(n => `@${n}`).join(' ') || 'Brak';
  const defenderTagsString = defenderNames.map(n => `@${n}`).join(' ') || 'Brak';
  const attackerMentions = attackerParticipants.map((pid, i) => ({ tag: `@${attackerNames[i]}`, id: pid }));
  const defenderMentions = defenderParticipants.map((pid, i) => ({ tag: `@${defenderNames[i]}`, id: pid }));

  const msgPayload = {
    body: `⚔️ **WOJNA GANGÓW: NAPAD NA SEJF!** ⚔️\n` +
      `Boss gangu **${gang.name}** wypowiedział wojnę gangowi **${targetGang.name}**!\n\n` +
      `💸 Koszt przygotowania ataku: **-${formatCurrency(cost)}** z sejfu gangu.\n` +
      `🎯 Cel: Kradzież od **15% do 35%** wrogiego sejfu (obecnie: **${formatCurrency(targetGang.vault || 0)}**).\n\n` +
      `⚔️ **Atakujący (${gang.name}):** ${attackerTagsString}\n` +
      `🛡️ **Obrońcy (${targetGang.name}):** ${defenderTagsString}\n\n` +
      `🚗 Członkowie obu gangów mają **2 minuty**, aby dołączyć do walki!\n` +
      `Wpisz: **!gang atak dolacz**, aby wesprzeć swój gang!`,
    mentions: [...attackerMentions, ...defenderMentions]
  };

  if (client.api && originThreadId) {
    client.api.sendMessage(msgPayload, originThreadId);
  }

  if (gang.alliances && gang.alliances.length > 0) {
    for (const allyId of gang.alliances) {
      const allyGang = allGangs[allyId];
      if (!allyGang) continue;
      const allyMembers = allyGang.members || [];
      if (allyMembers.length === 0) continue;

      const allyThreads = Array.from(client.activeThreadIds || []);
      let bestThread = null;
      let maxCount = 0;
      for (const threadId of allyThreads) {
        let count = 0;
        for (const mid of allyMembers) {
          const member = await withData(store => store.users[mid]);
          if (member && member.lastActiveThreadId === threadId) count++;
        }
        if (count > maxCount) {
          maxCount = count;
          bestThread = threadId;
        }
      }

      if (bestThread) {
        const mentionLine = [];
        for (const mid of allyMembers) {
          const member = await withData(store => store.users[mid]);
          if (member && member.name) {
            mentionLine.push(`@${member.name}`);
          }
        }
        const supportMsg = `🤝 **WSPIERANIE SKOKU GANGU** 🤝\n\n` +
          `Gang **${gang.name}** prosi o wsparcie w skoku!\n` +
          `📊 Obecnie zapisanych uczestników: **${attackerParticipants.length}**\n\n` +
          `👥 Członkowie gangu **${allyGang.name}** mogą wesprzeć skok wpisem:\n` +
          `**!gang wesprzyj**\n\n` +
          (mentionLine.length > 0 ? `${mentionLine.join(' ')}\n\n` : '') +
          `⚠️ *Wymagane minimum 100 komend. Więcej uczestników = większy łup!*`;

        try {
          client.api.sendMessage({ body: supportMsg, mentions: [] }, bestThread);
        } catch (err) {
          console.error('[GANG-AI] Błąd wysyłania powiadomienia o wsparciu:', err);
        }
      }
    }
  }

  setTimeout(async () => {
    const war = client.activeGangWars && client.activeGangWars.get(warKey);
    if (!war) return;

    if (client.activeGangWars) client.activeGangWars.delete(warKey);

    const listAttackers = Array.from(war.attackers);
    const listDefenders = Array.from(war.defenders);

    const outcome = await withData(store => {
      const attacker = (store.profiles.gangs || {})[gangId];
      const defender = (store.profiles.gangs || {})[targetGangId];
      if (!attacker || !defender) return { cancelled: true };

      const attCount = listAttackers.length;
      const defCount = listDefenders.length;
      const result = resolveWar(attacker, defender, attCount, defCount);

      if (result.success) {
        defender.vault = Math.max(0, (defender.vault || 0) - result.stolenTotal);
        const incomeBonus = getGangBossShopMultiplier(attacker, 'income');
        attacker.vault = Math.min(getVaultCap(), (attacker.vault || 0) + Math.floor(result.vaultShare * (1 + incomeBonus)));

        const membersTotalShare = result.stolenTotal - result.vaultShare;
        const sharePerPerson = attCount > 0 ? Math.floor(membersTotalShare / attCount) : 0;

        const attackerBonuses = {};
        for (const pid of listAttackers) {
          const pUser = createUser(pid, store.users);
          let finalShare = sharePerPerson;
          pUser.balance = (pUser.balance || 0) + finalShare;
          attackerBonuses[pid] = { godlo: 0, insygnia: 0 };
        }
        return { ...result, success: true, sharePerPerson, attackerBonuses };
      } else {
        const penaltyVault = Math.floor((attacker.vault || 0) * 0.20);
        const penaltyDefenders = Math.floor((attacker.vault || 0) * 0.15);
        const totalPenalty = penaltyVault + penaltyDefenders;
        attacker.vault = Math.max(0, (attacker.vault || 0) - totalPenalty);
        const defenderIncomeBonus = getGangBossShopMultiplier(defender, 'income');
        defender.vault = (defender.vault || 0) + Math.floor(penaltyVault * (1 + defenderIncomeBonus));

        let sharePerDefender = 0;
        const defenderBonuses = {};
        if (defCount > 0) {
          sharePerDefender = Math.floor(penaltyDefenders / defCount);
          for (const pid of listDefenders) {
            const pUser = createUser(pid, store.users);
            let finalShare = sharePerDefender;
            pUser.balance = (pUser.balance || 0) + finalShare;
            defenderBonuses[pid] = { godlo: 0, insygnia: 0 };
          }
        } else {
          defender.vault += Math.floor(penaltyDefenders * (1 + defenderIncomeBonus));
        }

        return { ...result, success: false, sharePerDefender, totalPenalty, defenderBonuses };
      }
    });

    if (outcome.cancelled) return;

    if (outcome.success) {
      const successMsg = `⚔️ **WOJNA GANGÓW ZAKOŃCZONA SUKCESEM!** ⚔️\n` +
        `Gang **${gang.name}** zniszczył obronę gangu **${targetGang.name}**!\n\n` +
        `🪓 Siła ataku: **${outcome.attackPower}** vs 🛡️ Siła obrony: **${outcome.defensePower}**\n\n` +
        `💰 **ŁUP WOJENNY:**\n` +
        `• Skradziono z wrogiego sejfu: **${formatCurrency(outcome.stolenTotal)}**\n` +
        `• Trafiło do sejfu Waszego gangu (30%): **+${formatCurrency(outcome.vaultShare)}**\n` +
        `• Każdy uczestnik ataku otrzymuje (70%): **+${formatCurrency(outcome.sharePerPerson)}** do portfela!` +
        (outcome.stolenItemId ? `\n\n🎒 **ŁUP SPECJALNY:** Gang przejął przedmiot **${getItemEmoji(outcome.stolenItemId)} ${getItemName(outcome.stolenItemId)}** z Bossowego Sklepu przeciwnika!` : '');
      if (client.api && originThreadId) {
        client.api.sendMessage(successMsg, originThreadId);
      }
      notifySupportThreads(client, war, successMsg);
    } else {
      const defenderDistribution = listDefenders.length > 0
        ? `Każdy obrońca otrzymuje: **+${formatCurrency(outcome.sharePerDefender)}** do portfela!`
        : `Ponieważ nikt nie bronił gangu osobiście, całe **${formatCurrency(outcome.totalPenalty)}** zasiliło sejf broniących!`;

      const failMsg = `🛡️ **ATAK ODPARTY! OBRONA GÓRĄ!** 🛡️\n` +
        `Gang **${targetGang.name}** skutecznie obronił swój skarbiec przed gangiem **${gang.name}**!\n\n` +
        `🪓 Siła ataku: **${outcome.attackPower}** vs 🛡️ Siła obrony: **${outcome.defensePower}**\n\n` +
        `💸 **KONSEKWENCJE PORAŻKI:**\n` +
        `• Gang szturmujący traci łącznie **${formatCurrency(outcome.totalPenalty)}** ze swojego sejfu!\n` +
        `• Sejf obrońców zyskuje: **+${formatCurrency(outcome.penaltyVault)}**\n` +
        `• ${defenderDistribution}` +
        (outcome.stolenItemId ? `\n\n🎒 **ŁUP SPECJALNY:** Gang obrońcy przejął przedmiot **${getItemEmoji(outcome.stolenItemId)} ${getItemName(outcome.stolenItemId)}** z Bossowego Sklepu atakujących!` : '');
      if (client.api && originThreadId) {
        client.api.sendMessage(failMsg, originThreadId);
      }
      notifySupportThreads(client, war, failMsg);
    }
  }, 120000).unref();

  return { type: 'attack', targetGangId, targetGangName: targetGang.name, cost };
}

async function executeAlliance(gang, cfg, store, client) {
  const maxAlliances = (config.gangAI && config.gangAI.maxAlliances) || 3;
  if ((gang.alliances || []).length >= maxAlliances) {
    return { type: 'alliance', skipped: true, reason: 'max_alliances' };
  }

  const allGangs = store.profiles.gangs || {};
  const gangId = gang.id || gang.gangId;
  const candidates = Object.entries(allGangs).filter(([id, g]) => id !== gangId && !(g.alliances || []).includes(gangId));

  if (candidates.length === 0) {
    return { type: 'alliance', skipped: true, reason: 'no_candidates' };
  }

  const aiWeight = (cfg && cfg.aiToAiAllianceWeight) || 3;
  const playerWeight = (cfg && cfg.aiToPlayerAllianceWeight) || 1;
  const aiCandidates = candidates.filter(([, g]) => g.isAI);
  const playerCandidates = candidates.filter(([, g]) => !g.isAI);

  let targetId = null;
  let targetGang = null;
  const totalWeight = aiCandidates.length * aiWeight + playerCandidates.length * playerWeight;

  if (totalWeight > 0) {
    let roll = Math.random() * totalWeight;
    const pickFrom = (arr, w) => {
      for (const [id, g] of arr) {
        roll -= w;
        if (roll <= 0) return [id, g];
      }
      return arr[0];
    };

    if (aiCandidates.length > 0 && playerCandidates.length > 0) {
      if (roll < aiWeight * aiCandidates.length) {
        [targetId, targetGang] = pickFrom(aiCandidates, aiWeight);
      } else {
        [targetId, targetGang] = pickFrom(playerCandidates, playerWeight);
      }
    } else if (aiCandidates.length > 0) {
      [targetId, targetGang] = pickFrom(aiCandidates, aiWeight);
    } else if (playerCandidates.length > 0) {
      [targetId, targetGang] = pickFrom(playerCandidates, playerWeight);
    }
  }

  if (!targetId || !targetGang) {
    return { type: 'alliance', skipped: true, reason: 'no_target' };
  }

  if (targetGang.isAI) {
    targetGang.alliances = targetGang.alliances || [];
    targetGang.allianceRequests = targetGang.allianceRequests || [];
    if (targetGang.alliances.includes(gangId)) {
      return { type: 'alliance', skipped: true, reason: 'already_allied' };
    }
    if ((targetGang.allianceRequests || []).includes(gangId)) {
      targetGang.allianceRequests = targetGang.allianceRequests.filter(id => id !== gangId);
      gang.alliances = gang.alliances || [];
      gang.alliances.push(targetId);
      targetGang.alliances.push(gangId);
      return { type: 'alliance', accepted: true, targetGangName: targetGang.name };
    }

    targetGang.allianceRequests.push(gangId);
    return { type: 'alliance', proposed: true, targetGangName: targetGang.name };
  }

  return { type: 'alliance', skipped: true, reason: 'player_gang' };
}

async function executeEvent(gang, cfg) {
  const events = [
    { name: 'magazyn', vaultMin: 30000, vaultMax: 120000 },
    { name: 'przemyt', vaultMin: 20000, vaultMax: 80000 },
    { name: 'przejęcie_gangu', vaultMin: 10000, vaultMax: 50000 },
    { name: 'napad_policji', vaultMin: -80000, vaultMax: -20000 },
    { name: 'zdradca', vaultMin: -30000, vaultMax: -10000 },
    { name: 'utrata_wyposazenia', vaultMin: -20000, vaultMax: -5000 }
  ];

  const ev = events[Math.floor(Math.random() * events.length)];
  const cap = getVaultCap();
  const change = randomInt(Math.min(ev.vaultMin, 0), Math.max(ev.vaultMax, 0));
  gang.vault = Math.max(0, Math.min(cap, (gang.vault || 0) + change));

  return { type: 'event', eventName: ev.name, change };
}

async function executeBuyBossCrate(gang, cfg) {
  const crates = getAllCrateDefinitions();
  const crateIds = Object.keys(crates);
  if (crateIds.length === 0) {
    return { type: 'buyBossCrate', skipped: true, reason: 'no_crates' };
  }

  const quantity = Math.floor(Math.random() * 3) + 1;

  const limitResult = await ensureDailyLimit(gang, quantity);
  if (!limitResult.allowed) {
    return { type: 'buyBossCrate', skipped: true, reason: limitResult.reason };
  }

  const weightedCrates = [];
  for (const cid of crateIds) {
    const def = crates[cid];
    const weight = Math.max(1, Math.floor(1000000 / def.price));
    weightedCrates.push({ id: cid, weight });
  }
  const totalWeight = weightedCrates.reduce((sum, c) => sum + c.weight, 0);
  let roll = Math.random() * totalWeight;
  let chosenCrateId = weightedCrates[0].id;
  for (const c of weightedCrates) {
    roll -= c.weight;
    if (roll <= 0) {
      chosenCrateId = c.id;
      break;
    }
  }

  const crate = crates[chosenCrateId];
  const totalCost = crate.price * quantity;
  if ((gang.vault || 0) < totalCost) {
    return { type: 'buyBossCrate', skipped: true, reason: 'insufficient_vault' };
  }

  const result = await withData(store => {
    const g = (store.profiles.gangs || {})[gang.id || gang.gangId];
    if (!g) return { error: 'not_found' };

    const purchaseResult = processBossShopPurchase(g, chosenCrateId, quantity);
    if (purchaseResult.error) {
      return { error: purchaseResult.error };
    }

    return {
      success: true,
      totalMoney: purchaseResult.totalMoney,
      droppedItems: purchaseResult.droppedItems,
      remainingPurchases: purchaseResult.remainingPurchases
    };
  });

  if (result.error) {
    return { type: 'buyBossCrate', skipped: true, reason: result.error };
  }

  const cap = getVaultCap();
  gang.vault = Math.min(cap, (gang.vault || 0) + result.totalMoney);

  return {
    type: 'buyBossCrate',
    success: true,
    crateId: chosenCrateId,
    quantity,
    totalMoney: result.totalMoney,
    droppedItems: result.droppedItems,
    remainingPurchases: result.remainingPurchases
  };
}

async function processAIGang(client, gangId, gang, cfg, forcedActionType, forcedTargetGangId) {
  const now = Date.now();
  if (!gang.isAI) return;

  if (!forcedActionType) {
    const nextActionTime = gang.aiNextActionTime || 0;
    if (now < nextActionTime) return;
  }

  const allGangs = await withData(store => (store.profiles.gangs || {}));
  let actionType;
  let scores;
  if (forcedActionType) {
    actionType = forcedActionType;
    scores = { forced: true };
  } else {
    scores = await scoreActions(gang, cfg, allGangs);
    actionType = pickBestAction(scores);
  }

  let result;
  switch (actionType) {
    case 'earn':
      result = await executeEarn(gang, cfg);
      break;
    case 'upgrade':
      result = await executeUpgrade(gang, cfg);
      break;
    case 'recruit':
      result = await executeRecruit(gang, cfg);
      break;
    case 'attack':
      result = await executeAttack(gang, cfg, client, forcedTargetGangId);
      break;
    case 'alliance':
      result = await executeAlliance(gang, cfg, await withData(store => store), client);
      break;
    case 'event':
      result = await executeEvent(gang, cfg);
      break;
    case 'buyBossCrate':
      result = await executeBuyBossCrate(gang, cfg);
      break;
    default:
      result = await executeEarn(gang, cfg);
  }

  gang.aiLastActionType = actionType;
  gang.aiActionLog = gang.aiActionLog || [];
  gang.aiActionLog.push({ type: actionType, result, scores, timestamp: now });
  if (gang.aiActionLog.length > 50) {
    gang.aiActionLog = gang.aiActionLog.slice(-50);
  }

  gang.aiNextActionTime = now + getFixedActionIntervalMs();

  await withData(store => {
    const g = (store.profiles.gangs || {})[gang.id];
    if (!g) return;
    g.vault = gang.vault || 0;
    g.levelDziupla = gang.levelDziupla || 0;
    g.levelBiznesy = gang.levelBiznesy || 0;
    g.levelFach = gang.levelFach || 0;
    g.members = gang.members || [];
    g.alliances = gang.alliances || [];
    g.allianceRequests = gang.allianceRequests || [];
    g.lastAttackTime = gang.lastAttackTime || 0;
    g.shieldUntil = gang.shieldUntil || 0;
    g.aiNextActionTime = gang.aiNextActionTime;
    g.aiLastActionType = gang.aiLastActionType;
    g.aiActionLog = gang.aiActionLog || [];
  });

  return [result];
}

async function ensureFixedAIGangs(store, cfg) {
  const fixedGangs = (cfg && cfg.fixedGangs) || [];
  const validIds = new Set(fixedGangs.map(def => def.name.toLowerCase().replace(/[^a-z0-9]/g, '')));
  const gangs = store.profiles.gangs || {};

  let staleCount = 0;
  for (const [gangId, gang] of Object.entries(gangs)) {
    if (gang.isAI && !validIds.has(gangId)) {
      delete gangs[gangId];
      for (const userId of Object.keys(store.users || {})) {
        if (String(userId).startsWith(`ai_${gangId}_`)) {
          delete store.users[userId];
        }
      }
      staleCount++;
    }
  }
  if (staleCount > 0) {
    console.log(`[GANG-AI] Wyczyszczono ${staleCount} nieaktualnych gangów AI spoza fixedGangs.`);
  }

  const createdGangIds = [];

  for (const def of fixedGangs) {
    const gangId = def.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (store.profiles.gangs[gangId]) continue;

    const startVaultMin = (cfg && cfg.startVaultMin) || 50000;
    const startVaultMax = (cfg && cfg.startVaultMax) || 300000;
    const startVault = Math.floor(Math.random() * (startVaultMax - startVaultMin + 1)) + startVaultMin;
    const startMembersMin = (cfg && cfg.startMembersMin) || 1;
    const startMembersMax = (cfg && cfg.startMembersMax) || 3;
    const startMemberCount = Math.floor(Math.random() * (startMembersMax - startMembersMin + 1)) + startMembersMin;

    const fakeUsers = generateFakeUsers(gangId, startMemberCount);

    store.profiles.gangs[gangId] = {
      id: gangId,
      name: def.name,
      bossId: `ai_${gangId}_boss`,
      deputies: [],
      members: Object.keys(fakeUsers),
      vault: startVault,
      levelDziupla: 0,
      levelBiznesy: 0,
      levelFach: 0,
      tributePercent: 0,
      lastHeistTime: 0,
      lastAttackTime: 0,
      shieldUntil: 0,
      isAI: true,
      aiPersonality: def.personality,
      aiNextActionTime: Date.now() + getFixedActionIntervalMs(),
      aiLastActionType: null,
      aiActionLog: [],
      alliances: [],
      allianceRequests: [],
      bossShopItems: [],
      bossShopPurchasesToday: 0,
      bossShopPurchasesDate: null
    };

    for (const [uid, uData] of Object.entries(fakeUsers)) {
      store.users[uid] = uData;
    }

    createdGangIds.push(gangId);
  }

  return createdGangIds;
}

async function handleAllianceProposalToAI(gangId, proposerGangId, cfg) {
  const result = await withData(store => {
    const gang = (store.profiles.gangs || {})[gangId];
    const proposer = (store.profiles.gangs || {})[proposerGangId];
    if (!gang || !gang.isAI) return { handled: false };
    if (!proposer) return { handled: false };

    const maxAlliances = (cfg && cfg.maxAlliances) || 3;
    if ((gang.alliances || []).length >= maxAlliances) {
      return { handled: true, accepted: false, reason: 'max_alliances' };
    }

    if (gang.alliances && gang.alliances.includes(proposerGangId)) {
      return { handled: true, accepted: true, reason: 'already_allied' };
    }

    if (gang.allianceRequests && gang.allianceRequests.includes(proposerGangId)) {
      gang.allianceRequests = gang.allianceRequests.filter(id => id !== proposerGangId);
      gang.alliances = gang.alliances || [];
      gang.alliances.push(proposerGangId);
      proposer.alliances = proposer.alliances || [];
      proposer.alliances.push(gangId);
      return { handled: true, accepted: true };
    }

    let acceptChance = (cfg && cfg.allianceAcceptChanceFromPlayer) || 0.35;
    if (proposer.isAI) {
      acceptChance = (cfg && cfg.allianceAcceptChanceFromAI) || 0.7;
    }

    if (Math.random() < acceptChance) {
      gang.alliances = gang.alliances || [];
      gang.alliances.push(proposerGangId);
      proposer.alliances = proposer.alliances || [];
      proposer.alliances.push(gangId);
      return { handled: true, accepted: true };
    }

    return { handled: true, accepted: false };
  });

  return result;
}

async function logAIAction(gangId, message) {
  console.log(`[GANG-AI] [${gangId}] ${message}`);
  try {
    await withData(store => {
      store.profiles.gangAILogs = store.profiles.gangAILogs || [];
      store.profiles.gangAILogs.push({ gangId, message, timestamp: Date.now() });
      if (store.profiles.gangAILogs.length > 500) {
        store.profiles.gangAILogs = store.profiles.gangAILogs.slice(-500);
      }
    });
  } catch (_) {}
}

async function getAIGangs() {
  return withData(store => {
    return Object.entries(store.profiles.gangs || {})
      .filter(([, g]) => g.isAI)
      .map(([id, g]) => ({ ...g, id }));
  });
}

async function countAIGangs() {
  return withData(store => {
    return Object.values(store.profiles.gangs || {}).filter(g => g.isAI).length;
  });
}

module.exports = {
  getPolandHour,
  generateGangName,
  generateFakeUsers,
  pickPersonality,
  scoreActions,
  pickBestAction,
  getUpgradePriority,
  getAttackWeight,
  getVaultCap,
  getMinVaultAfterAttack,
  getFixedActionIntervalMs,
  isAttackHour,
  randomParticipants,
  calcPower,
  resolveWar,
  notifySupportThreads,
  executeEarn,
  executeUpgrade,
  executeRecruit,
  executeAttack,
  executeAlliance,
  executeEvent,
  executeBuyBossCrate,
  processAIGang,
  ensureFixedAIGangs,
  handleAllianceProposalToAI,
  logAIAction,
  getAIGangs,
  countAIGangs
};
