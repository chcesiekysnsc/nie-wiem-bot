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
  const parts = cfg.gangAI && cfg.gangAI.nameParts ? cfg.gangAI.nameParts : { adjectives: [], nouns: [] };
  const adjectives = parts.adjectives || [];
  const nouns = parts.nouns || [];
  let name = '';
  let attempts = 0;
  do {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    name = `${adj} ${noun}`;
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
  const prefixes = ['X', 'Z', 'K', 'M', 'V', 'R', 'N', 'S', 'T', 'P', 'L', 'D', 'G', 'H', 'B'];
  const suffixes = ['_', '88', '99', '77', 'xx', 'zz', 'kk', 'mm', 'vv', 'rr'];
  const users = {};
  const bossId = `ai_${gangId}_boss`;
  users[bossId] = {
    isAI: true,
    name: `${prefixes[Math.floor(Math.random() * prefixes.length)]}${suffixes[Math.floor(Math.random() * suffixes.length)]}${Math.floor(Math.random() * 90 + 10)}`,
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
      name: `${prefixes[Math.floor(Math.random() * prefixes.length)]}${suffixes[Math.floor(Math.random() * suffixes.length)]}${Math.floor(Math.random() * 900 + 100)}`,
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

function selectAction(gang, cfg) {
  const weights = (cfg.gangAI && cfg.gangAI.actionWeights) || { earn: 35, upgrade: 22, recruit: 13, attack: 10, alliance: 8, event: 5 };
  const rerollChance = (cfg.gangAI && cfg.gangAI.repeatActionRerollChance) || 0.7;
  const entries = Object.entries(weights);
  let chosen = null;
  let attempts = 0;
  do {
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = Math.random() * totalWeight;
    for (const [action, weight] of entries) {
      roll -= weight;
      if (roll <= 0) {
        chosen = action;
        break;
      }
    }
    if (!chosen) chosen = entries[entries.length - 1][0];
    attempts++;
    if (chosen !== gang.aiLastActionType || attempts > 5 || Math.random() > rerollChance) {
      break;
    }
    chosen = null;
  } while (attempts < 10);

  if (!chosen) chosen = 'earn';
  return chosen;
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

function getActionIntervalMinutes() {
  const min = (config.gangAI && config.gangAI.actionIntervalMinutesMin) || 30;
  const max = (config.gangAI && config.gangAI.actionIntervalMinutesMax) || 120;
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
  const prefixes = ['X', 'Z', 'K', 'M', 'V', 'R', 'N', 'S'];
  const suffixes = ['_', '88', '99', '77', 'xx', 'zz'];
  const fakeUser = {
    isAI: true,
    name: `${prefixes[Math.floor(Math.random() * prefixes.length)]}${suffixes[Math.floor(Math.random() * suffixes.length)]}${Math.floor(Math.random() * 900 + 100)}`,
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

async function executeAttack(gang, cfg, client) {
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

  const aiGangs = possibleTargets.filter(([, g]) => g.isAI);
  const playerGangs = possibleTargets.filter(([, g]) => !g.isAI);
  const aiWeight = (cfg.gangAI && cfg.gangAI.aiToAiAllianceWeight) || 3;
  const playerWeight = (cfg.gangAI && cfg.gangAI.aiToPlayerAllianceWeight) || 1;
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
  const originThreadId = (client.activeThreadIds && client.activeThreadIds.size > 0)
    ? Array.from(client.activeThreadIds)[0]
    : null;

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

  const aiWeight = (cfg.gangAI && cfg.gangAI.aiToAiAllianceWeight) || 3;
  const playerWeight = (cfg.gangAI && cfg.gangAI.aiToPlayerAllianceWeight) || 1;
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

async function processAIGang(client, gangId, gang, cfg) {
  const now = Date.now();
  if (!gang.isAI) return;

  const nextActionTime = gang.aiNextActionTime || 0;
  if (now < nextActionTime) return;

  const actionsCount = Math.floor(Math.random() * ((cfg.gangAI && cfg.gangAI.actionsPerTickMax) || 3)) + ((cfg.gangAI && cfg.gangAI.actionsPerTickMin) || 1);
  const actions = [];

  for (let i = 0; i < actionsCount; i++) {
    let actionType = selectAction(gang, cfg);

    if (actionType === 'attack' && !isAttackHour()) {
      actionType = 'earn';
    }

    if (actionType === 'alliance') {
      const maxAlliances = (cfg.gangAI && cfg.gangAI.maxAlliances) || 3;
      if ((gang.alliances || []).length >= maxAlliances) {
        actionType = 'earn';
      }
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
        result = await executeAttack(gang, cfg, client);
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

    actions.push(result);
    gang.aiLastActionType = actionType;
    gang.aiActionLog = gang.aiActionLog || [];
    gang.aiActionLog.push({ type: actionType, result, timestamp: now });
    if (gang.aiActionLog.length > 50) {
      gang.aiActionLog = gang.aiActionLog.slice(-50);
    }
  }

  const interval = getActionIntervalMinutes();
  gang.aiNextActionTime = now + interval * 60 * 1000;

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

  return actions;
}

async function createAIGang(store, cfg) {
  const maxAIGangs = (cfg.gangAI && cfg.gangAI.maxAIGangs) || 5;
  const existingAI = Object.values(store.profiles.gangs || {}).filter(g => g.isAI);
  if (existingAI.length >= maxAIGangs) return null;

  let attempt = 0;
  let nameResult = null;
  do {
    nameResult = generateGangName(cfg);
    attempt++;
    if (attempt > 30) {
      nameResult.gangId = `ai_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
      nameResult.name = `AI-${nameResult.gangId.slice(-4)}`;
      break;
    }
  } while (store.profiles.gangs[nameResult.gangId]);

  const gangId = nameResult.gangId;
  const startVaultMin = (cfg.gangAI && cfg.gangAI.startVaultMin) || 50000;
  const startVaultMax = (cfg.gangAI && cfg.gangAI.startVaultMax) || 300000;
  const startVault = Math.floor(Math.random() * (startVaultMax - startVaultMin + 1)) + startVaultMin;
  const startMembersMin = (cfg.gangAI && cfg.gangAI.startMembersMin) || 1;
  const startMembersMax = (cfg.gangAI && cfg.gangAI.startMembersMax) || 3;
  const startMemberCount = Math.floor(Math.random() * (startMembersMax - startMembersMin + 1)) + startMembersMin;

  const fakeUsers = generateFakeUsers(gangId, startMemberCount);

  store.profiles.gangs[gangId] = {
    id: gangId,
    name: nameResult.name,
    bossId: fakeUsers[`ai_${gangId}_boss`].name,
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
    aiPersonality: pickPersonality(),
    aiNextActionTime: Date.now() + getActionIntervalMinutes() * 60 * 1000,
    aiLastActionType: null,
    aiActionLog: [],
    alliances: [],
    allianceRequests: []
  };

  for (const [uid, uData] of Object.entries(fakeUsers)) {
    store.users[uid] = uData;
  }

  return gangId;
}

async function handleAllianceProposalToAI(gangId, proposerGangId, cfg) {
  const result = await withData(store => {
    const gang = (store.profiles.gangs || {})[gangId];
    const proposer = (store.profiles.gangs || {})[proposerGangId];
    if (!gang || !gang.isAI) return { handled: false };
    if (!proposer) return { handled: false };

    const maxAlliances = (cfg.gangAI && cfg.gangAI.maxAlliances) || 3;
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

    let acceptChance = (cfg.gangAI && cfg.gangAI.allianceAcceptChanceFromPlayer) || 0.35;
    if (proposer.isAI) {
      acceptChance = (cfg.gangAI && cfg.gangAI.allianceAcceptChanceFromAI) || 0.7;
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
  selectAction,
  getUpgradePriority,
  getAttackWeight,
  getVaultCap,
  getMinVaultAfterAttack,
  getActionIntervalMinutes,
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
  createAIGang,
  handleAllianceProposalToAI,
  logAIAction,
  getAIGangs,
  countAIGangs
};
