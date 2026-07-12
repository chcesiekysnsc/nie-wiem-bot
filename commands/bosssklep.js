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
  processBossShopPurchase,
  ensureDailyLimit
} = require('../utils/gangBossShop');

const CRATE_ORDER = Object.keys(config.bossShopCrates && config.bossShopCrates.crates ? config.bossShopCrates.crates : {});

function renderBossShopList(bossShopItems = []) {
  const crates = getAllCrateDefinitions();
  return CRATE_ORDER.map((crateId, idx) => {
    const crate = crates[crateId];
    if (!crate) return '';
    const num = idx + 1;
    const owned = bossShopItems.includes(crateId);
    const strike = owned ? '~~' : '';
    const desc = `💰 ${formatCurrency(crate.moneyMin)}–${formatCurrency(crate.moneyMax)} | 🎁 ${Object.values(crate.items).map(i => `${i.emoji}${i.chance}%`).join(' ')}${owned ? ' (już posiadacie)' : ''}`;
    return `${strike}🛒 **${num}. ${crate.emoji} ${crate.name}** — **${formatCurrency(crate.price)}**\n_${desc}_${strike ? '\n' : ''}`;
  }).join('\n');
}

module.exports = {
  name: 'bosssklep',
  aliases: ['boss_sklep', 'sklep_boss'],
  async execute(client, message, args) {
    const firstArg = String(args && args[0] || '').toLowerCase();

    if (firstArg === 'help' || firstArg === 'opis' || firstArg === 'info') {
      const targetNum = String(args && args[1] || '').toLowerCase();
      if (!targetNum) {
        await message.reply(
          `ℹ️ Użyj: **!bosssklep help <numer>** aby zobaczyć szczegółowy opis skrzynki.\n` +
          `💡 Numery znajdziesz w liście: **!bosssklep**`
        );
        return;
      }

      const crates = getAllCrateDefinitions();
      const crateId = CRATE_ORDER[parseInt(targetNum, 10) - 1];
      if (!crateId || !crates[crateId]) {
        await message.reply(`❌ Nie znaleziono skrzynki o numerze **${targetNum}**. Wpisz **!bosssklep** aby zobaczyć listę.`);
        return;
      }

      const crate = crates[crateId];
      const itemsList = Object.entries(crate.items).map(([itemId, def]) => {
        return `• ${def.emoji} **${def.name}** — ${def.chance}%\n   _${def.description}_`;
      }).join('\n');

      await message.reply(
        `${crate.emoji} **${crate.name}** — ${formatCurrency(crate.price)}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 Drop pieniędzy: ${formatCurrency(crate.moneyMin)} – ${formatCurrency(crate.moneyMax)}\n\n` +
        `🎁 **Przedmioty:**\n${itemsList}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 Kup: **!bosssklep kup ${parseInt(targetNum, 10)} [ilość]**`
      );
      return;
    }

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

    if (firstArg === 'kup') {
      const targetNum = String(args && args[1] || '').toLowerCase();
      const crateId = CRATE_ORDER[parseInt(targetNum, 10) - 1];
      if (!crateId) {
        await message.reply(`❌ Nieprawidłowy numer skrzynki. Wpisz **!bosssklep** aby zobaczyć listę.`);
        return;
      }

      const crates = getAllCrateDefinitions();
      const crate = crates[crateId];
      if (!crate) {
        await message.reply(`❌ Nie znaleziono skrzynki o numerze **${targetNum}**.`);
        return;
      }

      const qtyRaw = args && args[2] ? parseInt(args[2], 10) : 1;
      const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;

      const purchaseResult = await withData(store => {
        const gang = store.profiles.gangs[readResult.gangId];
        if (!gang) return { error: '❌ Gang nie istnieje.' };
        return processBossShopPurchase(gang, crateId, quantity);
      });

      if (purchaseResult.error) {
        await message.reply(purchaseResult.error);
        return;
      }

      const lines = [
        `🛒 **Bossowy Sklep — Zakup**`,
        `📦 Skrzynka: **${crate.emoji} ${crate.name}** x${quantity}`,
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

    const remaining = 10 - (readResult.purchasesToday || 0);
    const response =
      `🛒 **BOSSOWY SKLEP GANGU**\n` +
      `${renderBossShopList(readResult.bossShopItems)}\n` +
      `💰 Sejf: **${formatCurrency(readResult.vault)}** | 📅 Dzisiaj: **${readResult.purchasesToday}/10** (pozostało: **${remaining}**)\n\n` +
      `💡 Kup: **!bosssklep kup <numer> [ilość]** | Szczegóły: **!bosssklep help <numer>**`;

    await message.reply(response);
  }
};
