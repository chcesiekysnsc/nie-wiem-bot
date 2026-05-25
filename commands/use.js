const config = require('../config/config');
const {
  ensureInventoryRecord,
  formatCurrency,
  getItemQuantity,
  removeItem
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
  name: 'use',
  aliases: ['uzyj'],
  async execute(client, message, args) {
    const numArg = String(args[0] || '').trim();

    if (!numArg) {
      const items = getOrderedItems().filter(i => i.num !== null);
      const list = items.map(i => `${i.num}. ${i.emoji} **${i.name}**`).join('\n');
      await message.reply(`🎒 **Użycie przedmiotu**\nWpisz **!use <numer>** aby użyć:\n${list}`);
      return;
    }

    const ordered = getOrderedItems();
    const entry = ordered.find(i => String(i.num) === numArg);

    if (!entry) {
      await message.reply(`❌ Nie znaleziono przedmiotu o numerze ${numArg}.`);
      return;
    }

    const itemId = entry.id;

    if (itemId.startsWith('paczka_')) {
      const otworzCommand = require('./otworz.js');
      const packShortName = itemId.replace('paczka_', '');
      await otworzCommand.execute(client, message, [packShortName]);
      return;
    }

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inv = ensureInventoryRecord(store.inventory, message.author.id);
      const qty = getItemQuantity(inv, itemId);

      if (qty < 1) {
        return { error: `❌ Nie posiadasz ${entry.emoji} **${entry.name}** w ekwipunku.` };
      }

      if (itemId === 'klodka') {
        if (user.klodkaActive) {
          return { error: '🔒 Masz już aktywną kłódkę na swoim koncie.' };
        }
        removeItem(inv, itemId, 1);
        user.klodkaActive = true;
        return { success: true, message: '🔒 **Użyto kłódki!** Twój portfel jest teraz zabezpieczony przed najbliższą próbą kradzieży.' };
      }

      if (itemId === 'bomba') {
        if (user.bombaActive) {
          return { error: '💣 Masz już aktywną bombę na swoim koncie.' };
        }
        removeItem(inv, itemId, 1);
        user.bombaActive = true;
        return { success: true, message: '💣 **Użyto bomby!** Twój portfel jest teraz zabezpieczony przed najbliższą próbą kradzieży (złodziej straci 40% swojego salda).' };
      }

      if (itemId === 'piwo') {
        if (user.piwoActive) {
          return { error: '🍺 Masz już aktywny efekt piwa na swoim koncie.' };
        }
        removeItem(inv, itemId, 1);
        user.piwoActive = true;
        return { success: true, message: '🍺 **Wypito piwo!** Twój następny napad (!rob) będzie miał zmodyfikowane szanse (zysk 25% lub strata 40%).' };
      }

      if (itemId === 'vip') {
        return { error: `👑 ${entry.name} działa automatycznie i pasywnie (zwiększa nagrody i pojemność banku).` };
      }

      return { error: `❌ Przedmiot ${entry.name} nie może być użyty ręcznie.` };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    await message.reply(result.message);
  }
};
