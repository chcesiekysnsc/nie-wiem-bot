const config = require('../config/config');
const {
  ensureInventoryRecord,
  formatCurrency,
  getItemQuantity,
  refreshBadges
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

function getOrderedItems() {
  let buyableCount = 0;
  return Object.entries(config.shopItems).map(([id, item]) => {
    const isBuyable = item.buyable !== false;
    return {
      num: isBuyable ? ++buyableCount : null,
      id,
      ...item
    };
  });
}

module.exports = {
  name: 'eq',
  aliases: ['inv', 'ekwipunek', 'inventory'],
  async execute(client, message, args) {
    let targetId = message.author.id;
    let targetName = message.author.username || `Uzytkownik_${targetId.slice(-6)}`;

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
    } else if (args[0] && /^\d+$/.test(args[0])) {
      targetId = args[0];
      targetName = `Uzytkownik_${targetId.slice(-6)}`;
      if (client.userNames.has(targetId)) {
        targetName = client.userNames.get(targetId);
      }
    }

    const result = await withData(store => {
      const user = createUser(targetId, store.users);
      const inventory = ensureInventoryRecord(store.inventory, targetId);
      refreshBadges(user, inventory);

      const ordered = getOrderedItems();
      const items = ordered
        .map(entry => {
          const qty = getItemQuantity(inventory, entry.id);
          if (qty < 1) return null;
          const prefix = entry.num ? `${entry.num}. ` : '';
          const passiveSuffix = entry.num ? '' : ' *(Pasywny)*';
          return `${prefix}${entry.emoji} **${entry.name}** x${qty}${passiveSuffix}`;
        })
        .filter(Boolean);

      return { items, balance: user.balance, bank: user.bank };
    });

    const response = 
      `📦 **Ekwipunek — ${targetName}**\n` +
      `${result.items.length ? result.items.join('\n') : 'Brak przedmiotów.'}\n` +
      `👛 Portfel: ${formatCurrency(result.balance)} | 🏦 Bank: ${formatCurrency(result.bank)}\n` +
      `💡 Aby użyć lub sprawdzić przedmiot, wpisz: **!use <numer>**`;

    await message.reply(response);
  }
};
