const config = require('../config/config');
const { createUser, withData } = require('../utils/storage');
const { formatCurrency } = require('../utils/economy');
const {
  hasGangBossItem,
  getGangBossShopMultiplier,
  getAllCrateDefinitions,
  getItemDefinition,
  getItemName,
  getItemEmoji,
  processBossShopPurchase
} = require('../utils/gangBossShop');

function renderBossShopList(gangItems, vault, purchasesToday) {
  const crates = getAllCrateDefinitions();
  const remaining = 10 - (purchasesToday || 0);

  const lines = [];
  lines.push(`🛒 **BOSSOWY SKLEP GANGU**`);
  lines.push(`💰 Sejf: **${formatCurrency(vault)}** | 📅 Dzisiaj: **${purchasesToday}/10** (pozostało: **${remaining}**)\n`);

  for (const [crateId, crate] of Object.entries(crates)) {
    const ownedItems = (crate.items && Object.keys(crate.items)) || [];
    const ownedTags = ownedItems.map(id => {
      const def = crate.items[id];
      return gangItems.includes(id) ? ` ~~${def.emoji} ${def.name}~~` : '';
    }).join('');

    lines.push(`${crate.emoji} **${crate.name}** — **${formatCurrency(crate.price)}**`);
    lines.push(`   💰 Drop: ${formatCurrency(crate.moneyMin)} – ${formatCurrency(crate.moneyMax)}`);
    lines.push(`   🎁 Przedmioty:`);
    for (const [itemId, itemDef] of Object.entries(crate.items)) {
      const owned = gangItems.includes(itemId);
      const strike = owned ? '~~' : '';
      const tag = owned ? ' (już posiadacie)' : '';
      lines.push(`   • ${strike}${itemDef.emoji} **${itemDef.name}** — ${itemDef.chance}% — ${itemDef.description}${strike}${tag}`);
    }
    lines.push('');
  }

  lines.push(`💡 Kup: **!bosssklep kup <skrzynia> [ilość]**`);
  return lines.join('\n');
}

module.exports = {
  name: 'bosssklep',
  aliases: ['boss_sklep', 'sklep_boss'],
  async execute(client, message, args) {
    const sub = String(args && args[0] || '').toLowerCase();

    const readResult = await withData(store => {
      store.profiles.gangs = store.profiles.gangs || {};
      const user = createUser(message.author.id, store.users);

      if (!user.gangId || !store.profiles.gangs[user.gangId]) {
        return { error: '❌ Nie należysz do żadnego gangu.' };
      }

      const gang = store.profiles.gangs[user.gangId];
      if (user.gangRole !== 'boss') {
        return { error: '❌ Tylko Boss gangu może korzystać z Bossowego Sklepu.' };
      }

      const today = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
      if (gang.bossShopPurchasesDate !== today) {
        gang.bossShopPurchasesDate = today;
        gang.bossShopPurchasesToday = 0;
      }

      return {
        gangId: user.gangId,
        gangName: gang.name,
        vault: gang.vault || 0,
        purchasesToday: gang.bossShopPurchasesToday || 0,
        bossShopItems: gang.bossShopItems || []
      };
    });

    if (readResult.error) {
      await message.reply(readResult.error);
      return;
    }

    if (sub === 'kup') {
      const crateId = String(args && args[1] || '').toLowerCase().trim();
      const qtyRaw = args && args[2] ? parseInt(args[2], 10) : 1;
      const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;

      const purchaseResult = await withData(store => {
        const gang = store.profiles.gangs[readResult.gangId];
        if (!gang) return { error: '❌ Gang nie istnieje.' };

        const crates = getAllCrateDefinitions();
        const crate = crates[crateId];
        if (!crate) {
          return { error: `❌ Nie znaleziono skrzynki **${crateId}**. Dostępne: ${Object.keys(crates).join(', ')}` };
        }

        return processBossShopPurchase(gang, crateId, quantity);
      });

      if (purchaseResult.error) {
        await message.reply(purchaseResult.error);
        return;
      }

      const crateDef = getItemDefinition(purchaseResult.droppedItems[0] || '');
      const crateName = crateDef ? crateDef.name : crateId;

      const lines = [
        `🛒 **BOSSOWY SKLEP — Zakup**`,
        `📦 Skrzynka: **${crateName}** x${quantity}`,
        `💰 Łączny drop pieniędzy: **+${formatCurrency(purchaseResult.totalMoney)}**`,
      ];

      if (purchaseResult.perCrateResults && purchaseResult.perCrateResults.length > 1) {
        lines.push(`\n📋 **Szczegóły każdej skrzynki:**`);
        purchaseResult.perCrateResults.forEach((crateResult, idx) => {
          const moneyLine = `   💰 #${idx + 1}: **+${formatCurrency(crateResult.money)}**`;
          const itemLine = crateResult.item
            ? `   🎁 #${idx + 1}: ${getItemEmoji(crateResult.item)} **${getItemName(crateResult.item)}**${crateResult.gained ? '' : ' (już posiadacie — pominięto)'}`
            : `   💨 #${idx + 1}: Brak przedmiotu`;
          lines.push(moneyLine);
          lines.push(itemLine);
        });
      }

      if (purchaseResult.itemsSummary) {
        lines.push(purchaseResult.itemsSummary);
      }

      lines.push(`📅 Pozostało zakupów dziś: **${purchaseResult.remainingPurchases}/10**`);

      await message.reply(lines.join('\n'));
      return;
    }

    const crates = getAllCrateDefinitions();
    const gangItems = readResult.bossShopItems || [];
    const purchasesToday = readResult.purchasesToday || 0;

    await message.reply(renderBossShopList(readResult.bossShopItems, readResult.vault, purchasesToday));
  }
};
