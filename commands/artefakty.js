const config = require('../config/config');
const { ensureInventoryRecord, getItemUpgradeLevel } = require('../utils/economy');
const { withData } = require('../utils/storage');
const { eventItems } = require('./eventitemy');

const eventItemIds = [
  'szkarlatne_oko', 'cien_nocy', 'wampirzy_sztylet', 'szwajcarski_klucz', 'krysztal_doswiadczenia',
  'ananas_na_pizzy', 'czarna_bandera', 'czarna_karta', 'kosci_oszusta', 'czterolistna_moneta'
];

const getNonEventItems = () => {
  const list = [];
  let num = 1;
  for (const [id, item] of Object.entries(config.shopItems)) {
    if (eventItemIds.includes(id)) continue;
    if (item.buyable !== false) continue;
    list.push({
      num: num++,
      id: id,
      name: item.name,
      emoji: item.emoji || '📦',
      shortDesc: item.shortDesc || '',
      longDesc: item.description || '',
      price: item.price,
      buyable: false,
      shopNote: item.shopNote || null
    });
  }
  return list;
};

const getEventItems = () => {
  const list = [];
  for (const [key, item] of Object.entries(eventItems)) {
    list.push({
      num: parseInt(key, 10),
      id: item.id,
      name: item.name,
      emoji: item.emoji,
      shortDesc: item.desc,
      longDesc: item.desc,
      award: item.award
    });
  }
  return list;
};

module.exports = {
  name: 'artefakty',
  aliases: ['artf', 'artefakt', 'itemy', 'przedmioty'],
  async execute(client, message, args) {
    const userId = message.author.id;
    const standardItems = getNonEventItems();
    const eventItemsList = getEventItems();

    if (args[0] === 'help' || args[0] === 'info') {
      const numParam = parseInt(args[1], 10);
      const standardArt = standardItems.find(a => a.num === numParam);
      const eventArt = eventItemsList.find(a => a.num === numParam);

      if (standardArt) {
        const ownedStatus = await withData(store => {
          const inv = ensureInventoryRecord(store.inventory, userId);
          const qty = inv[standardArt.id] || 0;
          const level = getItemUpgradeLevel(inv, standardArt.id);
          const upgradeStr = level > 0 ? ` (poziom +${level})` : '';
          return qty > 0 ? `🟢 Posiadasz (sztuk: ${qty}${upgradeStr})` : '🔴 Nie posiadasz';
        });

        let response = 
          `✨ **PRZEDMIOT: ${standardArt.name.toUpperCase()}** ${standardArt.emoji} ✨\n` +
          `• **Typ:** ${standardArt.buyable ? 'Kupowalny w sklepie' : 'Pasywny / Drop'}\n` +
          `• **Cena:** ${standardArt.price > 0 ? standardArt.price.toLocaleString() + ' viccoinów' : 'Niedostępny bezpośrednio w sklepie'}\n` +
          `• **Status:** ${ownedStatus}\n\n` +
          `ℹ️ **Opis działania:**\n${standardArt.longDesc}`;

        if (standardArt.shopNote) {
          response += `\n\n🔍 **Jak zdobyć:**\n${standardArt.shopNote}`;
        }

        await message.reply(response);
        return;
      }

      if (eventArt) {
        const ownedStatus = await withData(store => {
          const inv = ensureInventoryRecord(store.inventory, userId);
          const qty = inv[eventArt.id] || 0;
          return qty > 0 ? `🟢 Posiadasz (sztuk: ${qty})` : '🔴 Nie posiadasz';
        });

        const response = 
          `✨ **PRZEDMIOT EVENTOWY: ${eventArt.name.toUpperCase()}** ${eventArt.emoji} ✨\n` +
          `• **Nagroda za:** ${eventArt.award}\n` +
          `• **Status:** ${ownedStatus}\n\n` +
          `ℹ️ **Opis działania:**\n${eventArt.longDesc}`;

        await message.reply(response);
        return;
      }

      await message.reply(`❌ Nie znaleziono przedmiotu o takim numerze. Użyj: **!artefakty** aby zobaczyć listę (1-${standardItems.length + eventItemsList.length}).`);
      return;
    }

    const standardResult = await withData(store => {
      const inv = ensureInventoryRecord(store.inventory, userId);
      return standardItems.map(art => {
        const qty = inv[art.id] || 0;
        const level = getItemUpgradeLevel(inv, art.id);
        const upgradeStr = level > 0 ? ` +${level}` : '';
        const status = qty > 0 ? `🟢 (${qty} szt.${upgradeStr})` : '🔴 (brak)';
        return `${art.num}. ${art.emoji} *${art.name}* — ${art.shortDesc} ${status}`;
      });
    });

    const eventResult = await withData(store => {
      const inv = ensureInventoryRecord(store.inventory, userId);
      return eventItemsList.map(art => {
        const qty = inv[art.id] || 0;
        const status = qty > 0 ? `🟢 (${qty} szt.)` : '🔴 (brak)';
        return `${art.num}. ${art.emoji} *${art.name}* — *${art.shortDesc}* ${status}`;
      });
    });

    const response = 
      `✨ *Kolekcja Przedmiotów i Artefaktów* ✨\n` +
      `Oto wszystkie standardowe przedmioty i artefakty, które możesz dropnąć z paczek lub zdobyć w grze:\n\n` +
      `📦 **STANDARDOWE PRZEDMIOTY:**\n` +
      standardResult.join('\n') + `\n\n` +
      `🎁 **EVENTOWE PRZEDMIOTY:**\n` +
      eventResult.join('\n') + `\n\n` +
      `💡 Aby sprawdzić szczegółowe działanie danego przedmiotu, wpisz: *!artefakty help <numer>*`;

    await message.reply(response);
  }
};
