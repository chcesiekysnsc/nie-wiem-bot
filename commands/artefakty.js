const config = require('../config/config');
const { ensureInventoryRecord, getItemUpgradeLevel } = require('../utils/economy');
const { withData } = require('../utils/storage');

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

module.exports = {
  name: 'artefakty',
  aliases: ['artf', 'artefakt', 'itemy', 'przedmioty'],
  async execute(client, message, args) {
    const userId = message.author.id;
    const itemsList = getNonEventItems();

    if (args[0] === 'help' || args[0] === 'info') {
      const numParam = parseInt(args[1], 10);
      const art = itemsList.find(a => a.num === numParam);

      if (!art) {
        await message.reply(`❌ Nie znaleziono przedmiotu o takim numerze. Użyj: **!artefakty** aby zobaczyć listę (1-${itemsList.length}).`);
        return;
      }

      const ownedStatus = await withData(store => {
        const inv = ensureInventoryRecord(store.inventory, userId);
        const qty = inv[art.id] || 0;
        const level = getItemUpgradeLevel(inv, art.id);
        const upgradeStr = level > 0 ? ` (poziom +${level})` : '';
        return qty > 0 ? `🟢 Posiadasz (sztuk: ${qty}${upgradeStr})` : '🔴 Nie posiadasz';
      });

      let response = 
        `✨ **PRZEDMIOT: ${art.name.toUpperCase()}** ${art.emoji} ✨\n` +
        `• **Typ:** ${art.buyable ? 'Kupowalny w sklepie' : 'Pasywny / Drop'}\n` +
        `• **Cena:** ${art.price > 0 ? art.price.toLocaleString() + ' viccoinów' : 'Niedostępny bezpośrednio w sklepie'}\n` +
        `• **Status:** ${ownedStatus}\n\n` +
        `ℹ️ **Opis działania:**\n${art.longDesc}`;

      if (art.shopNote) {
        response += `\n\n🔍 **Jak zdobyć:**\n${art.shopNote}`;
      }

      await message.reply(response);
      return;
    }

    // List all non-event items
    const result = await withData(store => {
      const inv = ensureInventoryRecord(store.inventory, userId);
      return itemsList.map(art => {
        const qty = inv[art.id] || 0;
        const level = getItemUpgradeLevel(inv, art.id);
        const upgradeStr = level > 0 ? ` +${level}` : '';
        const status = qty > 0 ? `🟢 (${qty} szt.${upgradeStr})` : '🔴 (brak)';
        return `${art.num}. ${art.emoji} *${art.name}* — ${art.shortDesc} ${status}`;
      });
    });

    const response = 
      `✨ *Kolekcja Przedmiotów i Artefaktów* ✨\n` +
      `Oto wszystkie standardowe przedmioty i artefakty, które możesz dropnąć z paczek lub zdobyć w grze:\n\n` +
      result.join('\n') + `\n\n` +
      `💡 Aby sprawdzić szczegółowe działanie danego przedmiotu, wpisz: *!artefakty help <numer>*`;

    await message.reply(response);
  }
};
