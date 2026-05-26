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

  const normalized = String(input).toLowerCase();
  if (normalized === 'all' || normalized === 'max') {
    return Math.floor(Math.max(available, 0));
  }

  const amount = Number(input);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.floor(amount);
}

function xpForLevel(level, prestige = 0) {
  const safeLevel = Math.max(1, Math.floor(level || 1));
  const safePrestige = Math.max(0, Math.floor(prestige || 0));
  return config.economy.xpPerLevelBase + safeLevel * config.economy.xpPerLevelGrowth + safePrestige * 40;
}

function addXp(user, amount) {
  user.xp += Math.max(0, Math.floor(amount || 0));
  let leveledUp = false;

  while (user.xp >= xpForLevel(user.level, user.prestige)) {
    user.xp -= xpForLevel(user.level, user.prestige);
    user.level += 1;
    user.balance += 500 + user.level * 40;
    leveledUp = true;
  }

  return leveledUp;
}

function recordGame(user, net, xpGain = randomInt(15, 35)) {
  user.gamesPlayed += 1;

  if (net >= 0) {
    user.totalWon += net;
    user.wins = (user.wins || 0) + 1;
  } else {
    user.totalLost += Math.abs(net);
    user.losses = (user.losses || 0) + 1;
  }

  return addXp(user, xpGain);
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

function getBankCapacity(user, inventoryRecord) {
  let capacity = config.economy.bankBaseCapacity;

  if (hasItem(inventoryRecord, 'vip')) {
    capacity += config.economy.bankVipBonus;
  }

  if (hasItem(inventoryRecord, 'sejf')) {
    capacity += 75000;
  }

  if (hasItem(inventoryRecord, 'zlota_karta')) {
    capacity += config.economy.goldenCardBonus || 50000;
  }

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
  if (totalWealth >= 10000000) {
    staticBadges.push(config.badges.miliarder);
  } else if (totalWealth >= 1000000) {
    staticBadges.push(config.badges.milioner);
  } else if (totalWealth >= 150000) {
    staticBadges.push(config.badges.bogacz);
  }

  // Grinder (Gracz / Weteran / Uzależniony)
  if (user.gamesPlayed >= 2500) {
    staticBadges.push(config.badges.uzalezniony);
  } else if (user.gamesPlayed >= 500) {
    staticBadges.push(config.badges.weteran);
  } else if (user.gamesPlayed >= 100) {
    staticBadges.push(config.badges.gracz);
  }

  // Gambler (Hazardzista / Rekin / Bóg)
  if (user.totalWon >= 5000000) {
    staticBadges.push(config.badges.bog);
  } else if (user.totalWon >= 500000) {
    staticBadges.push(config.badges.rekin);
  } else if (user.totalWon >= 50000) {
    staticBadges.push(config.badges.hazardzista);
  }

  // Marriage
  if (user.marriedTo) staticBadges.push(config.badges.married);

  // Messages Sent (Gadatliwy / Spamer / Król Spamu)
  if (user.messageCount >= 25000) {
    staticBadges.push(config.badges.krolSpamu);
  } else if (user.messageCount >= 5000) {
    staticBadges.push(config.badges.spamer);
  } else if (user.messageCount >= 1000) {
    staticBadges.push(config.badges.gadatliwy);
  }

  // Commands Used (Klikacz / Władca Bota)
  if (user.commandsUsed >= 1000) {
    staticBadges.push(config.badges.wladcaBota);
  } else if (user.commandsUsed >= 100) {
    staticBadges.push(config.badges.klikacz);
  }

  // Level (Nowicjusz / Ekspert / Mistrz)
  if (user.level >= 50) {
    staticBadges.push(config.badges.mistrz);
  } else if (user.level >= 30) {
    staticBadges.push(config.badges.ekspert);
  } else if (user.level >= 10) {
    staticBadges.push(config.badges.nowicjusz);
  }

  // Wins
  if (user.wins >= 100) staticBadges.push(config.badges.zwyciezca);

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
  refreshBadges
};
