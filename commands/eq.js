const config = require('../config/config');
const {
  ensureInventoryRecord,
  formatCurrency,
  getItemQuantity,
  refreshBadges,
  getItemUpgradeLevel
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

function getAllItemsForHelp() {
  const shopEntries = getOrderedItems();
  const eventEntries = Object.values(eventItems).map((item, idx) => ({
    num: shopEntries.length + idx + 1,
    id: item.id,
    name: item.name,
    emoji: item.emoji,
    description: item.desc || item.description || '',
    isEvent: true
  }));
  return [...shopEntries, ...eventEntries];
}

module.exports = {
  name: 'eq',
  aliases: ['inv', 'ekwipunek', 'inventory'],
  async execute(client, message, args) {
    const firstArg = String(args[0] || '').toLowerCase();

    // !eq help <numer> — szczegółowy opis przedmiotu
    if (firstArg === 'help' || firstArg === 'opis' || firstArg === 'info') {
      const targetNum = String(args[1] || '').toLowerCase();
      if (!targetNum) {
        await message.reply(
          `ℹ️ Użyj: **!eq help <numer>** aby zobaczyć szczegółowy opis przedmiotu.\n` +
          `💡 Numery znajdziesz w swoim ekwipunku: **!eq**`
        );
        return;
      }

      const allItems = getAllItemsForHelp();
      const entry = allItems.find(i => String(i.num) === targetNum) || allItems.find(i => i.id === targetNum);

      if (!entry) {
        await message.reply(`❌ Nie znaleziono przedmiotu o numerze/nazwie **${args[1]}**. Wpisz **!eq** aby zobaczyć swój ekwipunek.`);
        return;
      }

      const typeLabel = entry.isEvent
        ? '🎉 Eventowy'
        : entry.type === 'permanent'
          ? '🔒 Jednorazowy (permanent)'
          : '📦 Stackable (wielokrotny)';

      const priceLine = entry.isEvent
        ? '💡 Niedostępny w sklepie — nagroda eventowa.'
        : (entry.buyable === false
          ? `❌ Niedostępny w sklepie — ${entry.shopNote || 'tylko z paczek'}`
          : `✅ Dostępny w sklepie za: **${formatCurrency(entry.price)}**`);

      await message.reply(
        `${entry.emoji} **${entry.name}**\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${entry.description}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📋 Typ: ${typeLabel}\n` +
        `${priceLine}`
      );
      return;
    }

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
          const level = getItemUpgradeLevel(inventory, entry.id);
          const upgradeSuffix = level > 0 ? ` +${level}` : '';
          return `${prefix}${entry.emoji} **${entry.name}**${upgradeSuffix} x${qty}${passiveSuffix}`;
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
      `💡 Aby użyć lub sprawdzić przedmiot, wpisz: **!use <numer>**\n` +
      `📖 Szczegóły przedmiotu: **!eq help <numer>**`;

    await message.reply(response);
  }
};
