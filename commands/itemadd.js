const config = require('../config/config');
const { ensureInventoryRecord, addItem } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const getAllItems = () => {
  const list = [];
  const addedIds = new Set();

  // 1. Dodajemy wszystkie przedmioty z config.shopItems
  for (const [id, def] of Object.entries(config.shopItems || {})) {
    list.push({
      id,
      name: def.name,
      emoji: def.emoji || '📦'
    });
    addedIds.add(id);
  }

  // 2. Dodajemy ewentualne brakujące przedmioty eventowe z eventitemy.js
  try {
    const eventItemyFile = require('./eventitemy');
    const eventItems = eventItemyFile.eventItems;
    if (eventItems) {
      for (const item of Object.values(eventItems)) {
        if (item && item.id && !addedIds.has(item.id)) {
          list.push({
            id: item.id,
            name: item.name,
            emoji: item.emoji || '🎁'
          });
          addedIds.add(item.id);
        }
      }
    }
  } catch (err) {
    console.error('[ITEMADD] Błąd ładowania eventItems:', err);
  }

  // 3. Dodajemy brakujące materiały ulepszeniowe
  const materials = [
    { id: 'material_upgrade_1', name: 'Żelazo', emoji: '🔩' },
    { id: 'material_upgrade_2', name: 'Miedź', emoji: '🔧' },
    { id: 'material_upgrade_3', name: 'Tytan', emoji: '⚙️' },
    { id: 'material_upgrade_4', name: 'Karbid', emoji: '💎' },
    { id: 'material_upgrade_5', name: 'Inżelit', emoji: '⚛️' }
  ];

  for (const mat of materials) {
    if (!addedIds.has(mat.id)) {
      list.push(mat);
      addedIds.add(mat.id);
    }
  }

  // Dodajemy kolejną numerację
  return list.map((item, index) => ({
    num: index + 1,
    ...item
  }));
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

    const itemsList = getAllItems();

    const input = String(args[0] || '').trim().toLowerCase();
    if (!input) {
      // Wyświetl całą listę z numerami i ID
      let listMsg = `🎁 **KREATOR PRZEDMIOTÓW (ADMIN)** 🎁\n`;
      listMsg += `Użyj: **!itemadd <numer/ID> [ilość]** lub **!itemadd all [ilość]**\n\n`;
      listMsg += `📋 **Lista dostępnych przedmiotów:**\n`;
      
      itemsList.forEach(item => {
        listMsg += `${item.num}. ${item.emoji} **${item.name}** (\`${item.id}\`)\n`;
      });
      
      await message.reply(listMsg);
      return;
    }

    // Obsługa dodawania wszystkich przedmiotów
    if (input === 'all') {
      let qty = 1;
      if (args[1]) {
        const parsedQty = parseInt(args[1], 10);
        if (!isNaN(parsedQty) && parsedQty > 0) {
          qty = parsedQty;
        }
      }

      await withData(store => {
        const inv = ensureInventoryRecord(store.inventory, creatorId);
        for (const item of itemsList) {
          addItem(inv, item.id, qty);
        }
      });

      await message.reply(`🎁 Pomyślnie dodałeś **${qty}x** wszystkich przedmiotów (${itemsList.length} rodzajów) do swojego ekwipunku!`);
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
      const inv = ensureInventoryRecord(store.inventory, creatorId);
      addItem(inv, item.id, qty);
    });

    await message.reply(`🎁 Pomyślnie dodałeś **${qty}x** ${item.emoji} **${item.name}** do swojego ekwipunku!`);
  }
};
