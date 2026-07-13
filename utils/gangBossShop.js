const config = require('../config/config');
const { withData, createUser, loadData } = require('./storage');
const { randomInt, formatCurrency } = require('./economy');

function hasGangBossItem(gang, itemId) {
  return Array.isArray(gang.bossShopItems) && gang.bossShopItems.includes(itemId);
}

function getGangBossShopMultiplier(gang, effectType) {
  if (!gang || !Array.isArray(gang.bossShopItems)) return 0;
  const items = gang.bossShopItems;
  let mult = 0;

  if (effectType === 'attack') {
    if (items.includes('szkolenie_bojowe')) mult += 0.05;
    if (items.includes('celowniki_laserowe')) mult += 0.10;
    if (items.includes('sztab_dowodzenia')) mult += 0.05;
  } else if (effectType === 'defense') {
    if (items.includes('mobilna_barykada')) mult += 0.06;
    if (items.includes('sztab_dowodzenia')) mult += 0.05;
  } else if (effectType === 'loot') {
    if (items.includes('van_opancerzony')) mult += 0.15;
    if (items.includes('sztab_dowodzenia')) mult += 0.10;
  } else if (effectType === 'heist_success') {
    if (items.includes('siec_informatorow')) mult += 0.10;
  } else if (effectType === 'cooldown') {
    if (items.includes('falszywe_dokumenty')) mult += 0.10;
  } else if (effectType === 'income') {
    if (items.includes('ksiegowy_gangu')) mult += 0.05;
    if (items.includes('sztab_dowodzenia')) mult += 0.10;
  } else if (effectType === 'work') {
    if (items.includes('warsztat')) mult += 0.10;
  }

  return mult;
}

function attemptStealBossItem(sourceGang, targetGang) {
  if (Math.random() > 0.10) return null;
  const targetItems = Array.isArray(targetGang.bossShopItems) ? targetGang.bossShopItems : [];
  if (targetItems.length === 0) return null;

  const itemId = targetItems[Math.floor(Math.random() * targetItems.length)];
  return itemId;
}

function getCrateDefinition(crateId) {
  const crates = (config.bossShopCrates && config.bossShopCrates.crates) || {};
  return crates[crateId] || null;
}

function getAllCrateDefinitions() {
  return (config.bossShopCrates && config.bossShopCrates.crates) || {};
}

function getItemDefinition(itemId) {
  const crates = getAllCrateDefinitions();
  for (const crate of Object.values(crates)) {
    if (crate.items && crate.items[itemId]) {
      return { ...crate.items[itemId], id: itemId };
    }
  }
  return null;
}

function getItemName(itemId) {
  const def = getItemDefinition(itemId);
  return def ? def.name : itemId;
}

function getItemEmoji(itemId) {
  const def = getItemDefinition(itemId);
  return def ? def.emoji : '📦';
}

function rollCrateRewards(crateId) {
  const crate = getCrateDefinition(crateId);
  if (!crate) return { money: 0, item: null };

  const money = randomInt(crate.moneyMin, crate.moneyMax);
  let item = null;

  if (crate.items && Object.keys(crate.items).length > 0) {
    const roll = Math.random() * 100;
    let cumulative = 0;
    for (const [itemId, def] of Object.entries(crate.items)) {
      cumulative += def.chance || 0;
      if (roll < cumulative) {
        item = itemId;
        break;
      }
    }
  }

  return { money, item };
}

async function ensureDailyLimit(gang, purchasesCount) {
  const today = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
  const currentDate = gang.bossShopPurchasesDate || null;

  if (currentDate !== today) {
    gang.bossShopPurchasesDate = today;
    gang.bossShopPurchasesToday = 0;
  }

  const remaining = 10 - (gang.bossShopPurchasesToday || 0);
  if (remaining <= 0) {
    return { allowed: false, remaining: 0, reason: 'limit_reached' };
  }

  if (purchasesCount > remaining) {
    return { allowed: false, remaining, reason: 'limit_exceeded' };
  }

  return { allowed: true, remaining: remaining - purchasesCount };
}

async function processBossShopPurchase(gang, crateId, quantity) {
  const crate = getCrateDefinition(crateId);
  if (!crate) {
    return { error: '❌ Nie znaleziono takiej skrzynki.' };
  }

  const limitResult = await ensureDailyLimit(gang, quantity);
  if (!limitResult.allowed) {
    if (limitResult.reason === 'limit_reached') {
      return { error: `❌ Przekroczono dzienny limit zakupów Bossowego Sklepu (10/dobę).` };
    }
    return { error: `❌ Przekroczono dzienny limit zakupów Bossowego Sklepu (10/dobę). Pozostało dziś: **${limitResult.remaining}** zakupów.` };
  }

  const totalCost = crate.price * quantity;
  if ((gang.vault || 0) < totalCost) {
    return { error: `❌ Brak środków w sejfie gangu. Potrzeba: **${formatCurrency(totalCost)}**, posiadacie: **${formatCurrency(gang.vault || 0)}**.` };
  }

  gang.vault = Math.max(0, (gang.vault || 0) - totalCost);

  let totalMoney = 0;
  const droppedItems = [];
  const gangItems = Array.isArray(gang.bossShopItems) ? gang.bossShopItems : [];
  const perCrateResults = [];

  for (let i = 0; i < quantity; i++) {
    const result = rollCrateRewards(crateId);
    totalMoney += result.money;
    const gained = result.item && !gangItems.includes(result.item);
    if (gained) {
      gangItems.push(result.item);
      droppedItems.push(result.item);
    }
    perCrateResults.push({ money: result.money, item: result.item, gained });
  }

  gang.bossShopItems = gangItems;
  gang.bossShopPurchasesToday = (gang.bossShopPurchasesToday || 0) + quantity;
  gang.bossShopPurchasesDate = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });

  const itemNames = droppedItems.map(id => `${getItemEmoji(id)} **${getItemName(id)}**`);
  const itemsSummary = itemNames.length > 0 ? `\n🎁 **Przedmioty:** ${itemNames.join(', ')}` : '';

  return {
    success: true,
    totalMoney,
    droppedItems,
    itemsSummary,
    perCrateResults,
    remainingPurchases: 10 - gang.bossShopPurchasesToday
  };
}

module.exports = {
  hasGangBossItem,
  getGangBossShopMultiplier,
  attemptStealBossItem,
  getCrateDefinition,
  getAllCrateDefinitions,
  getItemDefinition,
  getItemName,
  getItemEmoji,
  rollCrateRewards,
  ensureDailyLimit,
  processBossShopPurchase
};
