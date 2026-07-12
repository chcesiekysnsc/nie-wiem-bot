const config = require('../config/config');
const {
  ensureInventoryRecord,
  formatCurrency,
  getItemQuantity,
  refreshBadges
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { eventItems } = require('./eventitemy');

function getOrderedItems() {
  let count = 0;
  return Object.entries(config.shopItems).map(([id, item]) => {
    return {
      num: ++count,
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
          const prefix = `${entry.num}. `;
          const isActive = ['klodka', 'bomba', 'piwo'].includes(entry.id) || entry.id.startsWith('paczka_');
          const passiveSuffix = isActive ? '' : ' *(Pasywny)*';
          return `${prefix}${entry.emoji} **${entry.name}** x${qty}${passiveSuffix}`;
        })
        .filter(Boolean);

      const eventEntries = Object.values(eventItems)
        .map(entry => {
          const qty = getItemQuantity(inventory, entry.id);
          if (qty < 1) return null;
          return `${entry.emoji} **${entry.name}** x${qty} *(Eventowy)*`;
        })
        .filter(Boolean);

      return { items, eventEntries, balance: user.balance, bank: user.bank };
    });

    const allItems = [...result.items, ...result.eventEntries];
    const response =
      `📦 **Ekwipunek — ${targetName}**\n` +
      `${allItems.length ? allItems.join('\n') : 'Brak przedmiotów.'}\n` +
      `👛 Portfel: ${formatCurrency(result.balance)} | 🏦 Bank: ${formatCurrency(result.bank)}\n` +
      `💡 Aby użyć lub sprawdzić przedmiot, wpisz: **!use <numer>**`;

    await message.reply(response);
  }
};
