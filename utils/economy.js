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

  return capacity;
}

function refreshBadges(user, inventoryRecord) {
  const dynamicBadges = new Set(Object.values(config.badges));
  const staticBadges = Array.isArray(user.badges)
    ? user.badges.filter(badge => typeof badge === 'string' && !dynamicBadges.has(badge))
    : [];

  if (hasItem(inventoryRecord, 'vip')) staticBadges.push(config.badges.vip);
  if (user.balance + user.bank >= 150000) staticBadges.push(config.badges.rich);
  if (user.gamesPlayed >= 100) staticBadges.push(config.badges.grinder);
  if (user.totalWon >= 50000) staticBadges.push(config.badges.gambler);
  if (user.marriedTo) staticBadges.push(config.badges.married);

  user.badges = [...new Set(staticBadges)];
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
