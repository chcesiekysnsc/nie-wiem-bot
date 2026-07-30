const config = require('../config/config');
const { ensureInventoryRecord, getItemUpgradeLevel } = require('../utils/economy');
const { withData } = require('../utils/storage');
const { eventItems } = require('./eventitemy');
const {
  buildArtefaktyCategoryPrompt,
  buildArtefaktyCategoryList,
  resolveArtefaktyCategory
} = require('../utils/artefactHelpSystem');

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

function getStandardItemsCount() {
  return getNonEventItems().length;
}

function getEventItemsCount() {
  return getEventItems().length;
}

function getItemByGlobalNum(num) {
  const standardItems = getNonEventItems();
  const eventItemsList = getEventItems();
  if (num >= 1 && num <= standardItems.length) {
    return { item: standardItems[num - 1], type: 'standard' };
  }
  const eventOffset = standardItems.length;
  if (num > eventOffset && num <= eventOffset + eventItemsList.length) {
    return { item: eventItemsList[num - eventOffset - 1], type: 'event' };
  }
  return null;
}

module.exports = {
  name: 'artefakty',
  aliases: ['artf', 'artefakt', 'itemy', 'przedmioty'],
  async execute(client, message, args) {
    const userId = message.author.id;
    const standardItems = getNonEventItems();
    const eventItemsList = getEventItems();

    if (!args.length) {
      client.pendingArtefakty = client.pendingArtefakty || new Map();
      const senderId = message.author.id;
      const threadId = message.threadID;

      const existing = client.pendingArtefakty.get(senderId);
      if (existing) clearTimeout(existing.timeout);

      const timeout = setTimeout(() => {
        client.pendingArtefakty.delete(senderId);
      }, 60000);

      client.pendingArtefakty.set(senderId, { timeout, threadId });

      await message.reply({ embeds: [buildArtefaktyCategoryPrompt()] });
      return;
    }

    const firstArg = String(args[0] || '').toLowerCase();
    const categoryKey = resolveArtefaktyCategory(firstArg);

    if (categoryKey === 'standardowe') {
      const items = standardItems.map(art => {
        const ownedStatus = withData(store => {
          const inv = ensureInventoryRecord(store.inventory, userId);
          const qty = inv[art.id] || 0;
          const level = getItemUpgradeLevel(inv, art.id);
          const upgradeStr = level > 0 ? ` +${level}` : '';
          const status = qty > 0 ? `🟢 (${qty} szt.${upgradeStr})` : '🔴 (brak)';
          return `${art.num}. ${art.emoji} *${art.name}* — ${art.shortDesc} ${status}`;
        });
        return ownedStatus;
      });

      const result = await withData(store => {
        const inv = ensureInventoryRecord(store.inventory, userId);
        return standardItems.map(art => {
          const qty = inv[art.id] || 0;
          const level = getItemUpgradeLevel(inv, art.id);
          const upgradeStr = level > 0 ? ` +${level}` : '';
          const status = qty > 0 ? `🟢 (${qty} szt.${upgradeStr})` : '🔴 (brak)';
          return `${art.num}. ${art.emoji} *${art.name}* — ${art.shortDesc} ${status}`;
        });
      });

      await message.reply({
        embeds: [buildArtefaktyCategoryList('standardowe', standardItems)]
      });
      return;
    }

    if (categoryKey === 'eventowe') {
      await message.reply({
        embeds: [buildArtefaktyCategoryList('eventowe', eventItemsList)]
      });
      return;
    }

    if (firstArg === 'help' || firstArg === 'info') {
      const numParam = parseInt(args[1], 10);
      const resolved = getItemByGlobalNum(numParam);
      if (!resolved) {
        await message.reply(`❌ Nie znaleziono przedmiotu o takim numerze. Użyj: **!artefakty** aby zobaczyć listę (1-${standardItems.length + eventItemsList.length}).`);
        return;
      }

      if (resolved.type === 'standard') {
        const art = resolved.item;
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

      if (resolved.type === 'event') {
        const art = resolved.item;
        const ownedStatus = await withData(store => {
          const inv = ensureInventoryRecord(store.inventory, userId);
          const qty = inv[art.id] || 0;
          return qty > 0 ? `🟢 Posiadasz (sztuk: ${qty})` : '🔴 Nie posiadasz';
        });

        const response = 
          `✨ **PRZEDMIOT EVENTOWY: ${art.name.toUpperCase()}** ${art.emoji} ✨\n` +
          `• **Nagroda za:** ${art.award}\n` +
          `• **Status:** ${ownedStatus}\n\n` +
          `ℹ️ **Opis działania:**\n${art.longDesc}`;

        await message.reply(response);
        return;
      }
    }

    await message.reply(`❌ Nieprawidłowy argument. Użyj: **!artefakty** aby zobaczyć kategorie, lub **!artefakty <kategoria>** (standardowe/eventowe).`);
  }
};
