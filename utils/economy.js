const config = require('../config/config');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatNumber(value) {
  return new Intl.NumberFormat('pl-PL').format(Math.floor(Number(value) || 0));
}

function formatCurrency(value) {
  return `${config.currencyEmoji} ${formatNumber(value)}`;
}

function msToReadable(ms) {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    hours ? `${hours}h` : null,
    minutes ? `${minutes}m` : null,
    `${seconds}s`
  ].filter(Boolean).join(' ');
}

function resolveAmount(input, available) {
  if (!input) return null;

  let normalized = String(input).toLowerCase().trim();
  if (normalized === 'all' || normalized === 'max') {
    return Math.floor(Math.max(available, 0));
  }

  // Handle Polish/English multipliers: k (thousand), m (million), kk (million)
  normalized = normalized.replace(/kk/g, 'm');

  let multiplier = 1;
  if (normalized.endsWith('k')) {
    multiplier = 1000;
    normalized = normalized.slice(0, -1);
  } else if (normalized.endsWith('m')) {
    multiplier = 1000000;
    normalized = normalized.slice(0, -1);
  }

  // Replace comma with dot for decimals (e.g. 1,5k -> 1.5k)
  normalized = normalized.replace(/,/g, '.');

  // If there are multiple dots or a dot followed by exactly three digits and no multiplier,
  // it might be a thousands separator (e.g., 100.000 or 1.000.000).
  if (multiplier === 1) {
    if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
      normalized = normalized.replace(/\./g, '');
    }
  }

  const amountObj = parseFloat(normalized);
  if (isNaN(amountObj) || !isFinite(amountObj) || amountObj <= 0) {
    return null;
  }

  const finalAmount = Math.floor(amountObj * multiplier);
  if (finalAmount <= 0) return null;

  return finalAmount;
}

const MILESTONE_REWARDS = {
  10: { coins: 150000, items: { paczka_brazowa: 1 } },
  20: { coins: 250000, items: { klodka: 1 } },
  30: { coins: 350000, items: { bomba: 1, klodka: 1 } },
  40: { coins: 600000, items: { piwo: 1, bomba: 1, klodka: 1 } },
  50: { coins: 800000, items: { paczka_zlota: 1, piwo: 1 } },
  60: { coins: 1000000, items: { paczka_srebrna: 1, paczka_zlota: 1 } },
  70: { coins: 1200000, items: { paczka_diamentowa: 1 } },
  80: { coins: 1500000, items: { paczka_diamentowa: 1, paczka_zlota: 1, paczka_srebrna: 1, piwo: 1, klodka: 1 } },
  90: { coins: 1500000, items: { paczka_diamentowa: 2, paczka_zlota: 1, bomba: 2 } },
  100: { coins: 2000000, items: { paczka_tytanowa: 1, paczka_diamentowa: 2, paczka_zlota: 2, paczka_srebrna: 3 } }
};

function getMilestoneRewardDescription(level) {
  const reward = MILESTONE_REWARDS[level];
  if (!reward) return '';
  const parts = [];
  if (reward.coins) {
    parts.push(`+${formatCurrency(reward.coins)}`);
  }
  if (reward.items) {
    for (const [itemId, qty] of Object.entries(reward.items)) {
      const item = config.shopItems[itemId] || { name: itemId, emoji: '' };
      parts.push(`+${qty}x ${item.emoji} ${item.name}`);
    }
  }
  return parts.join(', ');
}

function giveMilestoneReward(user, newLevel, inventoryRecord) {
  const reward = MILESTONE_REWARDS[newLevel];
  if (!reward) return;

  if (reward.coins) {
    user.balance += reward.coins;
  }
  if (reward.items && inventoryRecord) {
    for (const [itemId, qty] of Object.entries(reward.items)) {
      addItem(inventoryRecord, itemId, qty);
    }
  }
}

function xpForLevel(level, prestige = 0) {
  const safeLevel = Math.max(1, Math.floor(level || 1));
  const safePrestige = Math.min(15, Math.max(0, Math.floor(prestige || 0)));
  const baseThreshold = config.economy.xpPerLevelBase + safeLevel * config.economy.xpPerLevelGrowth;
  const baseXP = Math.floor(baseThreshold * 1.20);
  const prestigeBonus = safePrestige * 65 + Math.floor(safePrestige * 0.05 * baseXP);
  return baseXP + prestigeBonus;
}

function addXp(user, amount, inventoryRecord = null) {
  let finalAmount = amount;
  if (inventoryRecord) {
    const hasCzterolistna = hasItem(inventoryRecord, 'czterolistna_moneta');
    let xpMultiplier = 1.0;
    if (hasItem(inventoryRecord, 'krysztal_doswiadczenia')) {
      xpMultiplier += hasCzterolistna ? 0.16 : 0.15;
    }
    if (hasItem(inventoryRecord, 'podrecznik_praktykanta')) {
      xpMultiplier += hasCzterolistna ? 0.06 : 0.05;
    }
    const { getItemSetBonus } = require('./itemSets');
    const setXpBonus = getItemSetBonus(inventoryRecord, 'xp_gain');
    xpMultiplier += setXpBonus;
    finalAmount = Math.round(finalAmount * xpMultiplier);
  }

  // Aplikuj event XP mnożnik
  const eventXpMul = getActiveEventMultiplier('xp');
  if (eventXpMul > 1) {
    finalAmount = Math.round(finalAmount * eventXpMul);
  }

  user.xp += Math.max(0, Math.floor(finalAmount || 0));
  const oldLevel = user.level;
  let leveledUp = false;
  const milestonesGained = [];

  while (user.xp >= xpForLevel(user.level, user.prestige)) {
    user.xp -= xpForLevel(user.level, user.prestige);
    user.level += 1;
    user.balance += 500 + user.level * 40;
    leveledUp = true;

    if (MILESTONE_REWARDS[user.level]) {
      giveMilestoneReward(user, user.level, inventoryRecord);
      milestonesGained.push(user.level);
      user.claimedMilestones = user.claimedMilestones || [];
      if (!user.claimedMilestones.includes(user.level)) {
        user.claimedMilestones.push(user.level);
      }
    }

    if (user.level === 100) {
      if ((user.prestige || 0) < 15) {
        user.level = 1;
        user.prestige = (user.prestige || 0) + 1;
        user.claimedMilestones = [];
      }
    }
  }

  return {
    leveledUp,
    oldLevel,
    newLevel: user.prestige > 0 ? `${user.level} [Prestiż ${user.prestige}]` : user.level,
    milestonesGained
  };
}

function applyTalizmanBonus(user, inventoryRecord, netGain) {
  if (netGain <= 0) return 0;
  if (!inventoryRecord || !hasItem(inventoryRecord, 'talizman_fortuny')) return 0;

  const streak = user.gambleStreak || 0;
  const pct = Math.min(10, streak);
  if (pct <= 0) return 0;

  return Math.floor(netGain * (pct / 100));
}

function recordGame(user, net, xpGain = 25, inventoryRecord = null) {
  user.gamesPlayed += 1;

  let finalXpGain = xpGain;
  if (user.badges) {
    let multiplier = 1.0;
    if (user.badges.includes(config.badges.gracz)) multiplier += 0.05;
    if (user.badges.includes(config.badges.weteran)) multiplier += 0.08;
    if (user.badges.includes(config.badges.uzalezniony)) multiplier += 0.12;
    finalXpGain = Math.round(finalXpGain * multiplier);
  }

  if (net > 0) {
    user.totalWon += net;
    user.wins = (user.wins || 0) + 1;
    user.gambleStreak = (user.gambleStreak || 0) + 1;
    user.lastGambleWin = net;
  } else if (net < 0) {
    user.totalLost += Math.abs(net);
    user.losses = (user.losses || 0) + 1;
    user.gambleStreak = 0;
  }

  return addXp(user, finalXpGain, inventoryRecord);
}

function ensureInventoryRecord(inventoryData, userId) {
  if (!inventoryData[userId] || typeof inventoryData[userId] !== 'object' || Array.isArray(inventoryData[userId])) {
    inventoryData[userId] = {};
  }

  return inventoryData[userId];
}

function getItemQuantity(inventoryRecord, itemId) {
  return Math.max(0, Math.floor(Number(inventoryRecord[itemId]) || 0));
}

function hasItem(inventoryRecord, itemId) {
  return getItemQuantity(inventoryRecord, itemId) > 0;
}

function addItem(inventoryRecord, itemId, quantity = 1) {
  inventoryRecord[itemId] = getItemQuantity(inventoryRecord, itemId) + Math.max(1, Math.floor(quantity));
}

function removeItem(inventoryRecord, itemId, quantity = 1) {
  const current = getItemQuantity(inventoryRecord, itemId);
  const safeQuantity = Math.max(1, Math.floor(quantity));

  if (current < safeQuantity) {
    return false;
  }

  const next = current - safeQuantity;
  if (next <= 0) {
    delete inventoryRecord[itemId];
  } else {
    inventoryRecord[itemId] = next;
  }

  return true;
}

function getItemUpgradeLevel(inventoryRecord, itemId) {
  if (!inventoryRecord || !inventoryRecord._upgrades || !inventoryRecord._upgrades[itemId]) {
    return 0;
  }
  return Math.max(0, Math.min(5, Math.floor(inventoryRecord._upgrades[itemId].level || 0)));
}

function getUpgradedLinearBonus(inventoryRecord, itemId, baseBonus, bonusPerLevel) {
  if (!hasItem(inventoryRecord, itemId)) return baseBonus > 0 ? 0 : 0;
  const level = getItemUpgradeLevel(inventoryRecord, itemId);
  return baseBonus + level * bonusPerLevel;
}

function getUpgradedCapBonus(inventoryRecord, itemId, baseCap, capPerLevel) {
  if (!hasItem(inventoryRecord, itemId)) return 0;
  const level = getItemUpgradeLevel(inventoryRecord, itemId);
  return baseCap + level * capPerLevel;
}

function getDealerBonusChance(inventoryRecord) {
  if (!hasItem(inventoryRecord, 'przekupiony_krupier')) return 0;
  const level = getItemUpgradeLevel(inventoryRecord, 'przekupiony_krupier');
  return 0.03 + level * 0.003;
}

function getBankCapacity(user, inventoryRecord) {
  let capacity = config.economy.bankBaseCapacity;

  if (hasItem(inventoryRecord, 'vip')) {
    const bonus = getUpgradedCapBonus(inventoryRecord, 'vip', config.economy.bankVipBonus, 5000);
    capacity += bonus;
  }

  if (hasItem(inventoryRecord, 'sejf')) {
    const bonus = getUpgradedCapBonus(inventoryRecord, 'sejf', 75000, 10000);
    capacity += bonus;
  }

  if (hasItem(inventoryRecord, 'zlota_karta')) {
    capacity += config.economy.goldenCardBonus || 50000;
  }

  if (hasItem(inventoryRecord, 'szwajcarski_klucz')) {
    capacity += 100000;
  }

  if (user.badges && user.badges.includes(config.badges.milioner)) {
    capacity += 25000;
  }
  if (user.badges && user.badges.includes(config.badges.miliarder)) {
    capacity += 50000;
  }

  capacity += getHouseBankCapacityBonus(user);

  return capacity;
}

function refreshBadges(user, inventoryRecord) {
  const dynamicBadges = new Set(Object.values(config.badges));
  const staticBadges = Array.isArray(user.badges)
    ? user.badges.filter(badge => typeof badge === 'string' && !dynamicBadges.has(badge))
    : [];

  // VIP
  if (hasItem(inventoryRecord, 'vip')) staticBadges.push(config.badges.vip);

  // Wealth (Bogacz / Milioner / Miliarder)
  const totalWealth = (user.balance || 0) + (user.bank || 0);
  if (totalWealth >= 30000000) {
    staticBadges.push(config.badges.miliarder);
  }
  if (totalWealth >= 5000000) {
    staticBadges.push(config.badges.milioner);
  }
  if (totalWealth >= 500000) {
    staticBadges.push(config.badges.bogacz);
  }

  // Grinder (Gracz / Weteran / Uzależniony)
  if (user.gamesPlayed >= 12000) {
    staticBadges.push(config.badges.uzalezniony);
  }
  if (user.gamesPlayed >= 2500) {
    staticBadges.push(config.badges.weteran);
  }
  if (user.gamesPlayed >= 400) {
    staticBadges.push(config.badges.gracz);
  }

  // Gambler (Hazardzista / Rekin / Bóg)
  if (user.totalWon >= 250000000) {
    staticBadges.push(config.badges.bog);
  }
  if (user.totalWon >= 50000000) {
    staticBadges.push(config.badges.rekin);
  }
  if (user.totalWon >= 1000000) {
    staticBadges.push(config.badges.hazardzista);
  }

  // Marriage
  if (user.marriedTo) staticBadges.push(config.badges.married);

  // Messages Sent (Gadatliwy / Spamer / Król Spamu)
  if (user.messageCount >= 120000) {
    staticBadges.push(config.badges.krolSpamu);
  }
  if (user.messageCount >= 25000) {
    staticBadges.push(config.badges.spamer);
  }
  if (user.messageCount >= 5000) {
    staticBadges.push(config.badges.gadatliwy);
  }

  // Commands Used (Klikacz / Władca Bota)
  if (user.commandsUsed >= 10000) {
    staticBadges.push(config.badges.wladcaBota);
  }
  if (user.commandsUsed >= 500) {
    staticBadges.push(config.badges.klikacz);
  }

  // Level (Nowicjusz / Ekspert / Mistrz)
  if (user.level >= 80) {
    staticBadges.push(config.badges.mistrz);
  }
  if (user.level >= 50) {
    staticBadges.push(config.badges.ekspert);
  }
  if (user.level >= 20) {
    staticBadges.push(config.badges.nowicjusz);
  }

  // Wins
  if (user.wins >= 500) staticBadges.push(config.badges.zwyciezca);

  // Gang Membership
  if (user.gangId && user.gangRole) {
    if (user.gangRole === 'boss') {
      staticBadges.push(config.badges.boss);
    } else if (user.gangRole === 'deputy') {
      staticBadges.push(config.badges.zastepca);
    } else {
      staticBadges.push(config.badges.czlonek);
    }
  }

  // Inject custom badges
  if (user.id === '100012709246650') {
    const otherBadges = staticBadges.filter(b => b !== '🍌 Minionek' && b !== '🏛️ Radny');
    staticBadges.length = 0;
    staticBadges.push('🍌 Minionek', '🏛️ Radny', ...otherBadges);
  } else if (user.id === '100088863765243') {
    const otherBadges = staticBadges.filter(b => b !== '🏛️ Radny');
    staticBadges.length = 0;
    staticBadges.push('🏛️ Radny', ...otherBadges);
  } else if (['100089655356822', '61554894353095', '100053875564339'].includes(user.id)) {
    if (!staticBadges.includes('🏛️ Radny')) {
      staticBadges.push('🏛️ Radny');
    }
  } else if (user.id === '100014929176652') {
    if (!staticBadges.includes('🏛️ Radny')) {
      staticBadges.push('🏛️ Radny');
    }
  }

  user.badges = [...new Set(staticBadges)];
  if (user.id === '100014929176652') {
    user.badges = ['🐐 GOAT', '🏛️ Radny', ...user.badges.filter(b => b !== '🐐 GOAT' && b !== '🏛️ Radny')];
  }
  return user.badges;
}

function getPassiveMultiplier(inventoryRecord, itemId, baseBonus) {
  if (!hasItem(inventoryRecord, itemId)) return 0;
  const hasCzterolistna = hasItem(inventoryRecord, 'czterolistna_moneta');
  const level = getItemUpgradeLevel(inventoryRecord, itemId);
  
  const upgradePerLevel = {
    garnitur: 0.005,
    kaczka_biznesu: 0.005,
    mocna_kawa: 0.01,
    podrecznik_praktykanta: 0.01,
    krysztal_doswiadczenia: 0.02,
    rekawice_robotnika: 0.005
  };
  
  const perLevel = upgradePerLevel[itemId] || 0;
  const totalBonus = baseBonus + level * perLevel + (hasCzterolistna ? 0.01 : 0.00);
  
  return parseFloat(totalBonus.toFixed(4));
}

function getActiveEventMultiplier(type) {
  try {
    const { loadData } = require('./storage');
    const profiles = loadData('profiles');
    const events = profiles.events || [];
    const now = Date.now();
    let best = 1;
    for (const e of events) {
      if (e.type === type && e.endTime > now && e.multiplier > best) {
        best = e.multiplier;
      }
    }
    return best;
  } catch (_) {
    return 1;
  }
}

function getBankInterestMultiplier() {
  try {
    const { loadData } = require('./storage');
    const profiles = loadData('profiles');
    const events = profiles.events || [];
    const now = Date.now();
    let best = 1;
    for (const e of events) {
      if (e.type === 'bank_interest' && e.endTime > now && e.multiplier > best) {
        best = e.multiplier;
      }
    }
    return best;
  } catch (_) {
    return 1;
  }
}

function getCrimeSuccessMultiplier() {
  try {
    const { loadData } = require('./storage');
    const profiles = loadData('profiles');
    const events = profiles.events || [];
    const now = Date.now();
    let best = 1;
    for (const e of events) {
      if (e.type === 'crime_luck' && e.endTime > now && e.multiplier > best) {
        best = e.multiplier;
      }
    }
    return best;
  } catch (_) {
    return 1;
  }
}

function getCompanyPayoutMultiplier() {
  try {
    const { loadData } = require('./storage');
    const profiles = loadData('profiles');
    const events = profiles.events || [];
    const now = Date.now();
    let best = 1;
    for (const e of events) {
      if (e.type === 'company_payout' && e.endTime > now && e.multiplier > best) {
        best = e.multiplier;
      }
    }
    return best;
  } catch (_) {
    return 1;
  }
}

function getShopDiscount() {
  try {
    const { loadData } = require('./storage');
    const profiles = loadData('profiles');
    const events = profiles.events || [];
    const now = Date.now();
    let bestDiscount = 0;
    for (const e of events) {
      if (e.type === 'shop_discount' && e.endTime > now) {
        const raw = e.reductionPercent;
        const discount = raw != null ? Number(raw) : (1 - Number(e.multiplier || 1)) * 100;
        if (Number.isFinite(discount) && discount > bestDiscount) {
          bestDiscount = discount;
        }
      }
    }
    return Math.min(100, Math.max(0, bestDiscount));
  } catch (_) {
    return 0;
  }
}

function getCasinoWinMultiplier(inventoryRecord) {
  if (!inventoryRecord) return 0;
  const { getItemSetBonus } = require('./itemSets');
  return getItemSetBonus(inventoryRecord, 'casino_win');
}

function getGlobalIncomeMultiplier(inventoryRecord) {
  if (!inventoryRecord) return 0;
  if (hasItem(inventoryRecord, 'sakiewka_kolekcjonera')) {
    const level = getItemUpgradeLevel(inventoryRecord, 'sakiewka_kolekcjonera');
    const base = 0.03;
    const perLevel = 0.001;
    const total = base + level * perLevel;
    return parseFloat(total.toFixed(4));
  }
  return 0;
}

function getGlobalCooldownReduction(inventoryRecord) {
  if (!inventoryRecord) return 0;
  let reduction = 0;
  if (hasItem(inventoryRecord, 'z_drive')) {
    const level = getItemUpgradeLevel(inventoryRecord, 'z_drive');
    const base = 0.15;
    const perLevel = 0.004;
    reduction += base + level * perLevel;
  }
  const { getItemSetBonus } = require('./itemSets');
  reduction += getItemSetBonus(inventoryRecord, 'cooldown_reduction');
  return Math.min(reduction, 0.50);
}

const HOUSE_TIERS = {
  1: { name: 'Rudera', emoji: '🏚️', price: 200000, workBonus: 0.025, crimeCooldown: 0, workCooldown: 0, bankCap: 0, maxUpgradeLvl: 1 },
  2: { name: 'Domek', emoji: '🏠', price: 400000, workBonus: 0.05, crimeCooldown: 0, workCooldown: 0, bankCap: 0, maxUpgradeLvl: 2 },
  3: { name: 'Apartament', emoji: '🏢', price: 800000, workBonus: 0.075, crimeCooldown: 0.05, workCooldown: 0, bankCap: 0, maxUpgradeLvl: 3 },
  4: { name: 'Willa', emoji: '🏰', price: 1600000, workBonus: 0.10, crimeCooldown: 0.075, workCooldown: 0.075, bankCap: 100000, maxUpgradeLvl: 4 },
  5: { name: 'Rezydencja', emoji: '👑', price: 3000000, workBonus: 0.125, crimeCooldown: 0.10, workCooldown: 0.10, bankCap: 250000, maxUpgradeLvl: 5 }
};

const WORKSHOP_BONUSES = {
  0: 0, 1: 0.01, 2: 0.02, 3: 0.03, 4: 0.06, 5: 0.09
};

const ARMORY_BONUSES = {
  0: { strength: 0, loot: 0 },
  1: { strength: 0.05, loot: 0.02 },
  2: { strength: 0.07, loot: 0.04 },
  3: { strength: 0.12, loot: 0.07 },
  4: { strength: 0.16, loot: 0.12 },
  5: { strength: 0.22, loot: 0.18 }
};

const GYM_BONUSES = {
  0: 0, 1: 0.02, 2: 0.03, 3: 0.06, 4: 0.08, 5: 0.12
};

function getHouseWorkBonus(user) {
  if (!user || !user.house || !user.house.tier) return 0;
  const tierInfo = HOUSE_TIERS[user.house.tier];
  if (!tierInfo) return 0;
  const houseBonus = tierInfo.workBonus || 0;
  const workshopLvl = (user.house.upgrades && user.house.upgrades.warsztat) || 0;
  const workshopBonus = WORKSHOP_BONUSES[workshopLvl] || 0;
  return houseBonus + workshopBonus;
}

function getHouseCooldownReduction(user, commandName) {
  if (!user || !user.house || !user.house.tier) return 0;
  const tierInfo = HOUSE_TIERS[user.house.tier];
  if (!tierInfo) return 0;
  
  let reduction = 0;
  if (commandName === 'work') {
    reduction += tierInfo.workCooldown || 0;
  } else if (commandName === 'crime') {
    reduction += tierInfo.crimeCooldown || 0;
  }
  
  const gymLvl = (user.house.upgrades && user.house.upgrades.silownia) || 0;
  const gymBonus = GYM_BONUSES[gymLvl] || 0;
  reduction += gymBonus;
  
  return reduction;
}

function getHouseBankCapacityBonus(user) {
  if (!user || !user.house || !user.house.tier) return 0;
  const tierInfo = HOUSE_TIERS[user.house.tier];
  if (!tierInfo) return 0;
  return tierInfo.bankCap || 0;
}

function getHouseGangBonus(user) {
  if (!user || !user.house || !user.house.tier) return { strength: 0, loot: 0 };
  const armoryLvl = (user.house.upgrades && user.house.upgrades.zbrojownia) || 0;
  const armoryBonus = ARMORY_BONUSES[armoryLvl] || { strength: 0, loot: 0 };
  return armoryBonus;
}

module.exports = {
  randomInt,
  formatNumber,
  formatCurrency,
  msToReadable,
  resolveAmount,
  xpForLevel,
  addXp,
  recordGame,
  ensureInventoryRecord,
  getItemQuantity,
  hasItem,
  addItem,
  removeItem,
  getBankCapacity,
  refreshBadges,
  MILESTONE_REWARDS,
  getMilestoneRewardDescription,
  giveMilestoneReward,
  applyTalizmanBonus,
  getPassiveMultiplier,
  getActiveEventMultiplier,
  getShopDiscount,
  getBankInterestMultiplier,
  getCrimeSuccessMultiplier,
  getCompanyPayoutMultiplier,
  getCasinoWinMultiplier,
  getGlobalIncomeMultiplier,
  getGlobalCooldownReduction,
  getItemUpgradeLevel,
  getUpgradedLinearBonus,
  getUpgradedCapBonus,
  getDealerBonusChance,
  getHouseWorkBonus,
  getHouseCooldownReduction,
  getHouseBankCapacityBonus,
  getHouseGangBonus,
  HOUSE_TIERS,
  WORKSHOP_BONUSES,
  ARMORY_BONUSES,
  GYM_BONUSES
};
