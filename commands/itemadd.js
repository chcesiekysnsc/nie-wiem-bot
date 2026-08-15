const config = require('../config/config');
const { ensureInventoryRecord, addItem } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const eventItemIds = [
  'szkarlatne_oko', 'cien_nocy', 'wampirzy_sztylet', 'szwajcarski_klucz', 'krysztal_doswiadczenia',
  'ananas_na_pizzy', 'czarna_bandera', 'czarna_karta', 'kosci_oszusta', 'czterolistna_moneta'
];

const getNonEventItems = () => {
  const list = [];
  let num = 1;
  for (const [id, def] of Object.entries(config.shopItems || {})) {
    const isPermanent = def.type === 'permanent';
    const isPackage = id.startsWith('paczka_');
    const isEvent = eventItemIds.includes(id);
    if (!isPermanent || isPackage || isEvent) continue;
    list.push({
      num,
      id,
      name: def.name,
      emoji: def.emoji || '📦'
    });
    num++;
  }
  return list;
};

module.exports = {
  name: 'itemadd',
  aliases: ['additem'],
  async execute(client, message, args) {
    const authorId = message.author.id;
    const creatorId = '100060812419294';
    if (authorId !== creatorId) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const itemsList = getNonEventItems();

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
