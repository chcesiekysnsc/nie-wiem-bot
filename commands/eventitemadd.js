const config = require('../config/config');
const { withData } = require('../utils/storage');
const { ensureInventoryRecord, addItem } = require('../utils/economy');
const { eventItems } = require('./eventitemy');

module.exports = {
  name: 'eventitemadd',
  aliases: [],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Nie masz uprawnień do użycia tej komendy.');
      return;
    }

    const nr = Number(args[0]);
    if (isNaN(nr) || !eventItems[nr]) {
      await message.reply('❌ Użyj: **!eventitemadd <nr>** (1-5). Wpisz **!eventitemy**, aby zobaczyć listę.');
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
