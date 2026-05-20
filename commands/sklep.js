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

function renderShopList() {
  return SHOP_ITEMS_ORDERED
    .map(item => `🛒 **${item.num}. ${item.emoji} ${item.name}** — ${formatCurrency(item.price)}\n_${item.description}_`)
    .join('\n');
}

module.exports = {
  name: 'sklep',
  aliases: ['shop', 'sklp', 'store'],
  async execute(client, message, args) {
    if (!args[0] || args[0].toLowerCase() === 'list') {
      const response = 
        `🛒 **SKLEP KASYNOWY**\n` +
        `${renderShopList()}\n` +
        `💡 Kup za pomocą: \`!sklep <numer> [ilość]\``;
      await message.reply(response);
      return;
    }

    let targetArg = args[0];
    let quantityArg = args[1];

    if (targetArg.toLowerCase() === 'buy') {
      targetArg = args[1];
      quantityArg = args[2];
    }

    const targetLower = String(targetArg || '').toLowerCase();
    const byNumber = SHOP_ITEMS_ORDERED.find(i => String(i.num) === targetLower);
    const shopEntry = byNumber || SHOP_ITEMS_ORDERED.find(i => i.id === targetLower);

    if (!shopEntry) {
      await message.reply(`❌ Nie znaleziono przedmiotu "${targetArg}". Wybierz numer 1-${SHOP_ITEMS_ORDERED.length}.`);
      return;
    }

    const itemId = shopEntry.id;
    const item = config.shopItems[itemId];
    const parsedQuantity = Math.floor(Number(quantityArg || 1));
    const quantity = item.type === 'permanent' ? 1 : Math.max(1, isNaN(parsedQuantity) ? 1 : parsedQuantity);

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
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
