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

      const lines = [
        `🛒 **Bossowy Sklep — Zakup zakończony!**`,
        `📦 Skrzynka: **${getItemDefinition(purchaseResult.droppedItems[0] || '')?.name || crateId}** x${quantity}`,
        `💰 Łączny drop pieniędzy: **+${formatCurrency(purchaseResult.totalMoney)}**`,
      ];

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
    const remaining = 10 - purchasesToday;

    let response = `🛒 **Bossowy Sklep Gangu** — Gang: **${readResult.gangName}**\n`;
    response += `💰 Sejf gangu: **${formatCurrency(readResult.vault)}**\n`;
    response += `📅 Dzisiejsze zakupy: **${purchasesToday}/10** (pozostało: **${remaining}**)\n\n`;

    for (const [crateId, crate] of Object.entries(crates)) {
      response += `${crate.emoji} **${crate.name}** — **${formatCurrency(crate.price)}**\n`;
      response += `   💰 Drop: ${formatCurrency(crate.moneyMin)} – ${formatCurrency(crate.moneyMax)}\n`;
      response += `   🎁 Przedmioty:\n`;

      for (const [itemId, itemDef] of Object.entries(crate.items)) {
        const owned = gangItems.includes(itemId);
        const ownedTag = owned ? ' (już posiadacie)' : '';
        response += `   • ${itemDef.emoji} **${itemDef.name}** — ${itemDef.chance}% — ${itemDef.description}${ownedTag}\n`;
      }

      response += '\n';
    }

    response += `💡 Aby kupić skrzynkę, wpisz: **!bosssklep kup <nazwa_skrzynki> [ilość]**`;

    await message.reply(response);
  }
};
