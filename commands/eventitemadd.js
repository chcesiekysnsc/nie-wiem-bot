const config = require('../config/config');
const { withData } = require('../utils/storage');
const { ensureInventoryRecord, addItem } = require('../utils/economy');
const { eventItems } = require('./eventitemy');

module.exports = {
  name: 'eventitemadd',
  aliases: [],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const nr = Number(args[0]);
    if (isNaN(nr) || !eventItems[nr]) {
      await message.reply('❌ Użyj: **!eventitemadd <nr>** (1-20). Wpisz **!eventitemy**, aby zobaczyć listę.');
      return;
    }

    const item = eventItems[nr];

    await withData(store => {
      const inv = ensureInventoryRecord(store.inventory, message.author.id);
      addItem(inv, item.id, 1);
    });

    await message.reply(`✅ Pomyślnie dodałeś przedmiot ${item.emoji} **${item.name}** do swojego ekwipunku!`);
  }
};
