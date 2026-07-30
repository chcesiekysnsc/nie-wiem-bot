const config = require('../config/config');
const { withData } = require('./storage');
const { randomInt, formatCurrency } = require('./economy');

const DAILY_LIMIT = (config.bossShopCrates && config.bossShopCrates.dailyLimit) || 10;
const MERCENARY_DURATION_MS = 24 * 60 * 60 * 1000;

function getCrates() {
  return (config.bossShopCrates && config.bossShopCrates.crates) || {};
}

function getCrate(crateId) {
  return getCrates()[crateId] || null;
}

function getCrateOrder() {
  return Object.keys(getCrates());
}

function getItemDef(itemId) {
  for (const crate of Object.values(getCrates())) {
    if (crate.items && crate.items[itemId]) {
      return { ...crate.items[itemId], id: itemId };
    }
  }
  return null;
}

function getItemName(itemId) {
  const def = getItemDef(itemId);
  return def ? def.name : itemId;
}

function getItemEmoji(itemId) {
  const def = getItemDef(itemId);
  return def ? def.emoji : '📦';
}

function hasItem(gang, itemId) {
  return Array.isArray(gang.bossShopItems) && gang.bossShopItems.includes(itemId);
}

function hasGangItem(gang, itemId) {
  return hasItem(gang, itemId) || (Array.isArray(gang.seasonRewards) && gang.seasonRewards.includes(itemId));
}

function getMultiplier(gang, effectType) {
  if (!gang || !Array.isArray(gang.bossShopItems)) return 0;
  const items = gang.bossShopItems;
  let mult = 0;

  switch (effectType) {
    case 'attack':
      if (items.includes('szkolenie_bojowe')) mult += 0.05;
      if (items.includes('celowniki_laserowe')) mult += 0.10;
      if (items.includes('sztab_dowodzenia')) mult += 0.05;
      if (items.includes('centrum_treningowe')) mult += 0.02;
      if (hasGangItem(gang, 'korona_hegemonii')) mult += 0.15;
      break;
    case 'defense':
      if (items.includes('mobilna_barykada')) mult += 0.06;
      if (items.includes('sztab_dowodzenia')) mult += 0.05;
      if (items.includes('monitoring')) mult += 0.02;
      if (hasGangItem(gang, 'lepsze_ufortyfikowanie')) mult += 0.15;
      break;
    case 'loot':
      if (items.includes('van_opancerzony')) mult += 0.15;
      if (items.includes('sztab_dowodzenia')) mult += 0.10;
      if (hasGangItem(gang, 'korona_hegemonii')) mult += 0.15;
      break;
    case 'heist_success':
      if (items.includes('siec_informatorow')) mult += 0.10;
      if (hasGangItem(gang, 'kodeks_honoru')) mult += 0.10;
      break;
    case 'cooldown':
      if (items.includes('falszywe_dokumenty')) mult += 0.10;
      if (hasGangItem(gang, 'korona_hegemonii')) mult += 0.15;
      break;
    case 'heist_income':
      if (hasGangItem(gang, 'korona_hegemonii')) mult += 0.15;
      break;
    case 'income':
      if (items.includes('ksiegowy_gangu')) mult += 0.05;
      if (items.includes('sztab_dowodzenia')) mult += 0.10;
      if (items.includes('pralnia_pieniedzy')) mult += 0.05;
      if (hasGangItem(gang, 'korona_hegemonii')) mult += 0.15;
      break;
    case 'work':
      if (items.includes('warsztat')) mult += 0.10;
      if (hasGangItem(gang, 'korona_hegemonii')) mult += 0.15;
      break;
    case 'vault_return':
      if (hasGangItem(gang, 'lepsze_ufortyfikowanie')) mult += 0.05;
      break;
  }

  return mult;
}

function attemptStealBossItem(targetGang) {
  let stealChance = 0.10;
  if (hasItem(targetGang, 'tajny_sejf')) {
    stealChance = Math.max(0, stealChance - 0.03);
  }
  if (Math.random() > stealChance) return null;

  const items = Array.isArray(targetGang.bossShopItems) ? targetGang.bossShopItems : [];
  if (items.length === 0) return null;

  return items[Math.floor(Math.random() * items.length)];
}

function rollCrate(crateId) {
  const crate = getCrate(crateId);
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

function getTodayKey() {
  return new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
}

function ensureDailyReset(gang) {
  const today = getTodayKey();
  if (gang.bossShopPurchasesDate !== today) {
    gang.bossShopPurchasesDate = today;
    gang.bossShopPurchasesToday = 0;
  }
}

function getRemainingPurchases(gang) {
  ensureDailyReset(gang);
  return DAILY_LIMIT - (gang.bossShopPurchasesToday || 0);
}

function canPurchase(gang, quantity = 1) {
  ensureDailyReset(gang);
  const remaining = getRemainingPurchases(gang);
  if (remaining <= 0) {
    return { allowed: false, remaining: 0, reason: 'limit_reached' };
  }
  if (quantity > remaining) {
    return { allowed: false, remaining, reason: 'limit_exceeded' };
  }
  return { allowed: true, remaining: remaining - quantity };
}

function processPurchase(gang, crateId, quantity, store) {
  const crate = getCrate(crateId);
  if (!crate) {
    return { error: '❌ Nie znaleziono takiej skrzynki.' };
  }

  const limitCheck = canPurchase(gang, quantity);
  if (!limitCheck.allowed) {
    if (limitCheck.reason === 'limit_reached') {
      return { error: `❌ Przekroczono dzienny limit zakupów Bossowego Sklepu (${DAILY_LIMIT}/dobę).` };
    }
    return { error: `❌ Przekroczono dzienny limit zakupów Bossowego Sklepu (${DAILY_LIMIT}/dobę). Pozostało dziś: **${limitCheck.remaining}** zakupów.` };
  }

  const totalCost = crate.price * quantity;
  if ((gang.vault || 0) < totalCost) {
    return { error: `❌ Brak środków w sejfie gangu. Potrzeba: **${formatCurrency(totalCost)}**, posiadacie: **${formatCurrency(gang.vault || 0)}**.` };
  }

  gang.vault = (gang.vault || 0) - totalCost;

  let totalMoney = 0;
  const droppedItems = [];
  const gangItems = Array.isArray(gang.bossShopItems) ? [...gang.bossShopItems] : [];
  const perCrateResults = [];

  for (let i = 0; i < quantity; i++) {
    const result = rollCrate(crateId);
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
  gang.bossShopPurchasesDate = getTodayKey();

  const itemNames = droppedItems.map(id => `${getItemEmoji(id)} **${getItemName(id)}**`);
  const itemsSummary = itemNames.length > 0 ? `\n🎁 **Przedmioty:** ${itemNames.join(', ')}` : '';

  const result = {
    success: true,
    totalMoney,
    droppedItems,
    itemsSummary,
    perCrateResults,
    remainingPurchases: DAILY_LIMIT - gang.bossShopPurchasesToday
  };

  if (droppedItems.includes('zaklocasz') && store && store.inventory && gang.members) {
    let transferred = 0;
    for (const memberId of gang.members) {
      const inv = store.inventory[memberId];
      if (inv && inv.zaklocasz && inv.zaklocasz > 0) {
        transferred += inv.zaklocasz;
        delete inv.zaklocasz;
      }
    }
    if (transferred > 0) {
      result.transferredZaklocasz = transferred;
    }
  }

  return result;
}

module.exports = {
  DAILY_LIMIT,
  MERCENARY_DURATION_MS,
  getCrates,
  getCrate,
  getCrateOrder,
  getItemDef,
  getItemName,
  getItemEmoji,
  hasItem,
  hasGangItem,
  getMultiplier,
  attemptStealBossItem,
  rollCrate,
  getTodayKey,
  ensureDailyReset,
  getRemainingPurchases,
  canPurchase,
  processPurchase,
  getGangBossShopMultiplier: getMultiplier,
  getAllCrateDefinitions: getCrates,
  getCrateDefinition: getCrate,
  getItemDefinition: getItemDef,
  processBossShopPurchase: processPurchase,
  ensureDailyLimit: canPurchase,
  hasGangBossItem: hasItem
};
