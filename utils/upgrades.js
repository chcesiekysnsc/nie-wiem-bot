const config = require('../config/config');
const { withData, createUser, ensureInventoryRecord, loadData, saveData } = require('./storage');
const { hasItem, addItem, removeItem, getItemQuantity, formatCurrency } = require('./economy');

const UPGRADE_MATERIALS = config.upgradeMaterials || ['Żelazo', 'Miedź', 'Tytan', 'Karbid', 'Inżelit'];
const UPGRADE_COSTS = config.upgradeCosts || [100000, 250000, 500000, 1000000, 2000000];
const MAX_LEVEL = 5;
const EVENT_ITEMS = [
  'szkarlatne_oko', 'cien_nocy', 'wampirzy_sztylet', 'szwajcarski_klucz', 'krysztal_doswiadczenia',
  'ananas_na_pizzy', 'czarna_bandera', 'czarna_karta', 'kosci_oszusta', 'czterolistna_moneta'
];

function getUpgradePath(itemId) {
  return config.upgradePaths[itemId] || config.gangUpgradePaths[itemId] || null;
}

function isUpgradeable(itemId) {
  if (EVENT_ITEMS.includes(itemId)) return false;
  return !!getUpgradePath(itemId);
}

function getItemUpgradeLevel(inventoryRecord, itemId) {
  if (!inventoryRecord || !inventoryRecord._upgrades || !inventoryRecord._upgrades[itemId]) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_LEVEL, Math.floor(inventoryRecord._upgrades[itemId].level || 0)));
}

function getUpgradeBonus(itemId, level) {
  const path = getUpgradePath(itemId);
  if (!path || !Array.isArray(path.bonuses)) return null;
  const idx = Math.max(0, Math.min(level, path.bonuses.length - 1));
  return path.bonuses[idx] || null;
}

function getNextUpgradeBonus(itemId, currentLevel) {
  if (currentLevel >= MAX_LEVEL) return null;
  return getUpgradeBonus(itemId, currentLevel + 1);
}

function getUpgradeRequirements(itemId, currentLevel) {
  if (currentLevel >= MAX_LEVEL) return null;

  const nextLevel = currentLevel + 1;
  const materialIdx = nextLevel - 1;
  const materialName = UPGRADE_MATERIALS[materialIdx] || `Materiał ${nextLevel}`;
  const coinCost = UPGRADE_COSTS[materialIdx] || 0;

  return {
    level: nextLevel,
    coins: coinCost,
    copies: 1,
    material: materialName,
    materialId: `material_upgrade_${nextLevel}`
  };
}

function canUpgradeItem(itemId, inventoryRecord, userBalance) {
  if (!isUpgradeable(itemId)) {
    return { canUpgrade: false, reason: '❌ Ten przedmiot nie może być ulepszany.' };
  }

  const currentLevel = getItemUpgradeLevel(inventoryRecord, itemId);
  if (currentLevel >= MAX_LEVEL) {
    return { canUpgrade: false, reason: `❌ Przedmiot osiągnął maksymalny poziom +${MAX_LEVEL}.` };
  }

  const qty = getItemQuantity(inventoryRecord, itemId);
  if (qty <= 0) {
    return { canUpgrade: false, reason: '❌ Nie posiadasz tego przedmiotu w ekwipunku.' };
  }

  const reqs = getUpgradeRequirements(itemId, currentLevel);
  if (!reqs) {
    return { canUpgrade: false, reason: '❌ Nie można określić wymagań ulepszenia.' };
  }

  return { canUpgrade: true, currentLevel, requirements: reqs };
}

async function upgradeItem(userId, itemId) {
  const result = await withData(store => {
    const user = createUser(userId, store.users);
    const inventory = ensureInventoryRecord(store.inventory, userId);

    const check = canUpgradeItem(itemId, inventory, user.balance);
    if (!check.canUpgrade) {
      return { error: check.reason };
    }

    const { currentLevel, requirements } = check;

    if (user.balance < requirements.coins) {
      return { error: `❌ Brak środków. Potrzebujesz **${formatCurrency(requirements.coins)}**, posiadasz **${formatCurrency(user.balance)}**.` };
    }

    const copiesNeeded = requirements.copies;
    if (getItemQuantity(inventory, itemId) < copiesNeeded) {
      return { error: `❌ Potrzebujesz **${copiesNeeded}x** ${config.shopItems[itemId]?.emoji || ''} ${config.shopItems[itemId]?.name || itemId}, a posiadasz tylko **${getItemQuantity(inventory, itemId)}**.` };
    }

    const materialQty = getItemQuantity(inventory, requirements.materialId);
    if (materialQty <= 0) {
      return { error: `❌ Potrzebujesz **1x ${requirements.material}**, a nie posiadasz go.` };
    }

    user.balance -= requirements.coins;
    removeItem(inventory, itemId, copiesNeeded);
    removeItem(inventory, requirements.materialId, 1);

    if (!inventory._upgrades) {
      inventory._upgrades = {};
    }
    if (!inventory._upgrades[itemId]) {
      inventory._upgrades[itemId] = { level: 0, lastUpgradeAt: 0 };
    }
    inventory._upgrades[itemId].level = currentLevel + 1;
    inventory._upgrades[itemId].lastUpgradeAt = Date.now();

    const newLevel = inventory._upgrades[itemId].level;
    const bonus = getUpgradeBonus(itemId, newLevel);

    return {
      success: true,
      itemId,
      newLevel,
      bonus,
      balance: user.balance,
      materialUsed: requirements.material
    };
  });

  return result;
}

function getAllUpgradableItems(inventoryRecord) {
  const items = [];
  for (const itemId of Object.keys(config.shopItems)) {
    if (isUpgradeable(itemId) && getItemQuantity(inventoryRecord, itemId) > 0) {
      items.push(itemId);
    }
  }
  return items;
}

function resolveItemId(input) {
  const q = String(input || '').toLowerCase().trim();
  if (!q) return null;

  if (config.shopItems[q]) return q;
  if (config.upgradePaths[q]) return q;
  if (config.gangUpgradePaths[q]) return q;

  for (const [id, item] of Object.entries(config.shopItems)) {
    if (item.name.toLowerCase().includes(q)) return id;
  }
  for (const id of Object.keys(config.upgradePaths)) {
    const def = config.shopItems[id];
    if (def && def.name.toLowerCase().includes(q)) return id;
  }

  return null;
}

function formatBonusText(itemId, bonus) {
  if (!bonus) return '';
  const parts = [];
  for (const [key, value] of Object.entries(bonus)) {
    const num = Number(value);
    if (!Number.isFinite(num)) continue;

    const flatKeys = new Set(['bankBonus', 'bankCapacity', 'maxBet', 'extraWeeklyDraws', 'cooldownMinutes', 'robLootPercent']);
    if (flatKeys.has(key)) {
      const label = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .trim();
      const formatted = key === 'maxBet' || key === 'bankBonus' || key === 'bankCapacity'
        ? formatCurrency(num)
        : num.toFixed(key === 'cooldownMinutes' || key === 'extraWeeklyDraws' ? 0 : 1);
      parts.push(`${formatted} ${label}`);
    } else {
      const pct = num * 100;
      const label = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .trim();
      const decimals = pct < 10 ? 1 : (Number.isInteger(pct) ? 0 : 1);
      parts.push(`+${pct.toFixed(decimals)}% ${label}`);
    }
  }
  return parts.join(', ');
}

module.exports = {
  UPGRADE_MATERIALS,
  UPGRADE_COSTS,
  MAX_LEVEL,
  EVENT_ITEMS,
  getUpgradePath,
  isUpgradeable,
  getItemUpgradeLevel,
  getUpgradeBonus,
  getNextUpgradeBonus,
  getUpgradeRequirements,
  canUpgradeItem,
  upgradeItem,
  getAllUpgradableItems,
  resolveItemId,
  formatBonusText
};

