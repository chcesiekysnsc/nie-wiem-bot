const config = require('../config/config');
const { ensureInventoryRecord, addItem } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'itemadd',
  aliases: ['additem'],
  async execute(client, message, args) {
    const authorId = message.author.id;

    // Sprawdź czy to admin
    const isAdmin = config.admins.includes(authorId);
    if (!isAdmin) {
      await message.reply('❌ Nie masz uprawnień do korzystania z tej komendy.');
      return;
    }

    // Dynamicznie tworzymy listę wszystkich przedmiotów z config.shopItems
    const itemsList = Object.entries(config.shopItems).map(([id, item], idx) => ({
      num: idx + 1,
      id: id,
      name: item.name,
      emoji: item.emoji || '📦'
    }));

    const input = String(args[0] || '').trim().toLowerCase();
    if (!input) {
      // Wyświetl całą listę z numerami i ID
      let listMsg = `🎁 **KREATOR PRZEDMIOTÓW (ADMIN)** 🎁\n`;
      listMsg += `Użyj: **!itemadd <numer/ID> [ilość]** (np. *!itemadd 1 5* lub *!itemadd vip*)\n\n`;
      listMsg += `📋 **Lista dostępnych przedmiotów:**\n`;
      
      itemsList.forEach(item => {
        listMsg += `${item.num}. ${item.emoji} **${item.name}** (\`${item.id}\`)\n`;
      });
      
      await message.reply(listMsg);
      return;
    }

    // Szukamy po numerze lub po ID
    const parsedNum = parseInt(input, 10);
    const item = itemsList.find(i => i.num === parsedNum || i.id === input);

    if (!item) {
      await message.reply(`❌ Nie znaleziono przedmiotu o ID lub numerze: **${input}**. Wpisz **!itemadd** bez parametrów, aby zobaczyć listę.`);
      return;
    }

    // Opcjonalna ilość (domyślnie 1)
    let qty = 1;
    if (args[1]) {
      const parsedQty = parseInt(args[1], 10);
      if (!isNaN(parsedQty) && parsedQty > 0) {
        qty = parsedQty;
      }
    }

    await withData(store => {
      const inv = ensureInventoryRecord(store.inventory, authorId);
      addItem(inv, item.id, qty);
    });

    await message.reply(`🎁 Pomyślnie dodałeś **${qty}x** ${item.emoji} **${item.name}** do swojego ekwipunku!`);
  }
};
