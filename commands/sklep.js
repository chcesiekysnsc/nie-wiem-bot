const config = require('../config/config');
const {
  addItem,
  ensureInventoryRecord,
  formatCurrency,
  hasItem,
  refreshBadges
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const SHOP_ITEMS_ORDERED = Object.entries(config.shopItems).map(([id, item], i) => ({
  num: i + 1,
  id,
  ...item
}));

// Lista sklepu — krótkie opisy, paczki jako lootbox
function renderShopList() {
  return SHOP_ITEMS_ORDERED
    .filter(item => item.buyable !== false)
    .map(item => {
      const isPackage = item.id.startsWith('paczka_');
      const desc = isPackage ? 'lootbox' : (item.shortDesc || item.description);
      return `🛒 **${item.num}. ${item.emoji} ${item.name}** — ${formatCurrency(item.price)}\n_${desc}_`;
    })
    .join('\n');
}

module.exports = {
  name: 'sklep',
  aliases: ['shop', 'sklp', 'store'],
  async execute(client, message, args) {
    const firstArg = String(args[0] || '').toLowerCase();

    // !sklep help <nr> — szczegółowy opis itema
    if (firstArg === 'help' || firstArg === 'opis' || firstArg === 'info') {
      const targetNum = String(args[1] || '').toLowerCase();
      if (!targetNum) {
        await message.reply(
          `ℹ️ Użyj: **!sklep help <numer>** aby zobaczyć szczegółowy opis przedmiotu.\n` +
          `💡 Numery znajdziesz w liście sklepu: **!sklep**`
        );
        return;
      }

      const shopEntry = SHOP_ITEMS_ORDERED.find(i => String(i.num) === targetNum)
        || SHOP_ITEMS_ORDERED.find(i => i.id === targetNum);

      if (!shopEntry) {
        await message.reply(`❌ Nie znaleziono przedmiotu o numerze **${args[1]}**. Wpisz **!sklep** aby zobaczyć listę.`);
        return;
      }

      const item = config.shopItems[shopEntry.id];
      const typeLabel = item.type === 'permanent' ? '🔒 Jednorazowy (permanent)' : '📦 Stackable (wielokrotny)';
      const buyLabel  = item.buyable === false
        ? `❌ Niedostępny w sklepie — ${item.shopNote || 'tylko z paczek'}`
        : `✅ Dostępny w sklepie — kup: **!sklep ${shopEntry.num} [ilość]**`;

      await message.reply(
        `${shopEntry.emoji} **${shopEntry.name}** — ${formatCurrency(shopEntry.price)}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${item.description}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📋 Typ: ${typeLabel}\n` +
        `${buyLabel}`
      );
      return;
    }

    // !sklep (bez argumentów lub "list") — lista z krótkimi opisami
    if (!firstArg || firstArg === 'list') {
      const response =
        `🛒 **SKLEP KASYNOWY**\n` +
        `${renderShopList()}\n` +
        `💡 Kup: **!sklep <numer> [ilość]** | Szczegóły: **!sklep help <numer>**`;
      await message.reply(response);
      return;
    }

    // Obsługa zakupu
    let targetArg  = args[0];
    let quantityArg = args[1];

    if (firstArg === 'buy') {
      targetArg   = args[1];
      quantityArg = args[2];
    }

    const targetLower = String(targetArg || '').toLowerCase();
    const byNumber  = SHOP_ITEMS_ORDERED.find(i => String(i.num) === targetLower);
    const shopEntry = byNumber || SHOP_ITEMS_ORDERED.find(i => i.id === targetLower);

    if (!shopEntry) {
      await message.reply(`❌ Nie znaleziono przedmiotu \"${targetArg}\". Wybierz numer 1–${SHOP_ITEMS_ORDERED.filter(i => i.buyable !== false).length} lub wpisz **!sklep**.`);
      return;
    }

    const itemId = shopEntry.id;
    const item   = config.shopItems[itemId];

    if (item.buyable === false) {
      await message.reply(`❌ **${item.emoji} ${item.name}** nie jest dostępny w sklepie.\n💡 ${item.shopNote || 'Zdobądź go z paczki!'}`);
      return;
    }

    const parsedQuantity = Math.floor(Number(quantityArg || 1));
    const quantity = item.type === 'permanent' ? 1 : Math.max(1, isNaN(parsedQuantity) ? 1 : parsedQuantity);

    const result = await withData(store => {
      const user      = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);

      if (item.type === 'permanent' && hasItem(inventory, itemId)) {
        return { error: '❌ Posiadasz już ten przedmiot (permanent).' };
      }

      if (itemId === 'ticket') {
        const currentCount = inventory[itemId] || 0;
        if (currentCount + quantity > 5) {
          return { error: `❌ Limit biletów na osobę wynosi 5. Obecnie posiadasz: ${currentCount}.` };
        }
      }

      const totalPrice = item.price * quantity;
      if (user.balance < totalPrice) {
        return { error: `❌ Brak środków. Potrzebujesz ${formatCurrency(totalPrice)}, posiadasz ${formatCurrency(user.balance)}.` };
      }

      user.balance -= totalPrice;
      addItem(inventory, itemId, quantity);
      refreshBadges(user, inventory);

      return { quantity, totalPrice, balance: user.balance };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    await message.reply(`🛒 Zakup udany! Kupiono **${item.name}** x${result.quantity} za **${formatCurrency(result.totalPrice)}**. (Portfel: ${formatCurrency(result.balance)})`);
  }
};
