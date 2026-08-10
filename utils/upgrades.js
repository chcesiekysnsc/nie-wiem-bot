const config = require('../config/config');
const { withData, createUser, loadData, saveData } = require('./storage');
const { hasItem, addItem, removeItem, getItemQuantity, formatCurrency, ensureInventoryRecord } = require('./economy');

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
    // NIE usuwamy samego przedmiotu - ulepszanie go wzmacnia, a nie niszczy.
    // Zużywamy tylko materiał ulepszeniowy.
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
    if (!config.shopItems[itemId]) continue;
    if (isUpgradeable(itemId) && getItemQuantity(inventoryRecord, itemId) > 0) {
      items.push(itemId);
    }
  }
  return items;
}

function resolveItemId(input) {
  const q = String(input || '').toLowerCase().trim();
  if (!q) return null;

  // Sprawdź czy to jest numer (np. "2" lub "s1" lub "sklep 1")
  const shopMatch = q.match(/^(?:s|sklep)\s*(\d+)$/);
  if (shopMatch) {
    const num = parseInt(shopMatch[1], 10);
    let currentNum = 1;
    for (const [id, item] of Object.entries(config.shopItems)) {
      if (item.buyable !== false) {
        if (currentNum === num) return id;
        currentNum++;
      }
    }
  }

  const artMatch = q.match(/^(\d+)$/);
  if (artMatch) {
    const num = parseInt(artMatch[1], 10);
    const eventItemIds = [
      'szkarlatne_oko', 'cien_nocy', 'wampirzy_sztylet', 'szwajcarski_klucz', 'krysztal_doswiadczenia',
      'ananas_na_pizzy', 'czarna_bandera', 'czarna_karta', 'kosci_oszusta', 'czterolistna_moneta'
    ];
    let currentNum = 1;
    for (const [id, item] of Object.entries(config.shopItems)) {
      if (eventItemIds.includes(id)) continue;
      if (item.buyable !== false) continue;
      if (currentNum === num) return id;
      currentNum++;
    }
  }

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

function getItemNumberLabel(itemId) {
  const item = config.shopItems[itemId];
  if (!item) return '';

  const eventItemIds = [
    'szkarlatne_oko', 'cien_nocy', 'wampirzy_sztylet', 'szwajcarski_klucz', 'krysztal_doswiadczenia',
    'ananas_na_pizzy', 'czarna_bandera', 'czarna_karta', 'kosci_oszusta', 'czterolistna_moneta'
  ];

  if (item.buyable !== false) {
    let currentNum = 1;
    for (const [id, it] of Object.entries(config.shopItems)) {
      if (it.buyable !== false) {
        if (id === itemId) return `S${currentNum}. `;
        currentNum++;
      }
    }
  } else if (!eventItemIds.includes(itemId)) {
    let currentNum = 1;
    for (const [id, it] of Object.entries(config.shopItems)) {
      if (eventItemIds.includes(id)) continue;
      if (it.buyable !== false) continue;
      if (id === itemId) return `${currentNum}. `;
      currentNum++;
    }
  }

  return '';
}

function formatBonusText(itemId, bonus) {
  if (!bonus) return '';
  const TRANSLATIONS = {
    chance: 'szansy na obronę',
    robLootBonus: 'zysku z kradzieży (!rob)',
    robPenaltyReduction: 'redukcji kary przy kradzieży',
    activationChance: 'szansy na aktywację',
    extraWeeklyDraws: 'dodatkowych losowań tygodniowo',
    robLootPercent: 'łupu z kradzieży',
    cooldownMinutes: 'minut cooldownu dla złodzieja',
    dailyBonus: 'bonusu do !daily',
    workBonus: 'bonusu do !work',
    bankBonus: 'bonusu do banku',
    bankCapacity: 'pojemności banku',
    robChance: 'szansy na kradzież (!rob)',
    robPenaltyBonus: 'zwiększenia kary przy wpadce',
    blackjackBonusChance: 'szansy na lepszą kartę w blackjacku',
    defensePenaltyBonus: 'kary nałożonej na złodzieja',
    defenseChanceReduction: 'szansy na obronę',
    crimeChanceReduction: 'szansy na wpadkę w !crime',
    xpBonus: 'bonusu do XP',
    companyIncomeBonus: 'zysków z firm (!firma)',
    globalIncomeBonus: 'globalnego dochodu',
    doubleWorkChance: 'szansy na podwójne zarobki w !work',
    cooldownReduction: 'skrócenia cooldownu',
    streakBonus: 'bonusu za wygraną z rzędu',
    maxStreakBonus: 'maksymalnego bonusu za streak',
    gangAttackBonus: 'zysków z napadów gangu',
    gangWarBonus: 'zysków z wojen gangów',
    maxBet: 'maksymalnego zakładu'
  };

  const parts = [];
  for (const [key, value] of Object.entries(bonus)) {
    const num = Number(value);
    if (!Number.isFinite(num)) continue;

    const label = TRANSLATIONS[key] || key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .trim();

    const flatKeys = new Set(['bankBonus', 'bankCapacity', 'maxBet', 'extraWeeklyDraws', 'cooldownMinutes', 'robLootPercent']);
    if (flatKeys.has(key)) {
      const formatted = key === 'maxBet' || key === 'bankBonus' || key === 'bankCapacity'
        ? formatCurrency(num)
        : num.toFixed(key === 'cooldownMinutes' || key === 'extraWeeklyDraws' ? 0 : 1);
      parts.push(`${formatted} ${label}`);
    } else {
      const pct = num * 100;
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
  getItemNumberLabel,
  formatBonusText
};

