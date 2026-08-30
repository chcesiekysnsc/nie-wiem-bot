const config = require('../config/config');
const { withData } = require('../utils/storage');
const { ensureInventoryRecord, removeItem } = require('../utils/economy');
const { eventItems } = require('./eventitemy');

module.exports = {
  name: 'eventitemdel',
  aliases: [],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const nr = Number(args[0]);
    if (isNaN(nr) || !eventItems[nr]) {
      await message.reply('❌ Użyj: **!eventitemdel <nr>** (1-20). Wpisz **!eventitemy**, aby zobaczyć listę.');
      return;
    }

    const item = eventItems[nr];

    const result = await withData(store => {
      const inv = ensureInventoryRecord(store.inventory, message.author.id);
      return removeItem(inv, item.id, 1);
    });

    if (result) {
      await message.reply(`✅ Pomyślnie usunąłeś przedmiot ${item.emoji} **${item.name}** ze swojego ekwipunku!`);
    } else {
      await message.reply(`❌ Nie posiadasz przedmiotu ${item.emoji} **${item.name}** w ekwipunku.`);
    }
  }
};
