const config = require('../config/config');
const { ensureInventoryRecord, getItemUpgradeLevel } = require('../utils/economy');
const { withData } = require('../utils/storage');
const { eventItems } = require('./eventitemy');
const {
  buildArtefaktyCategoryPrompt,
  buildArtefaktyCategoryList,
  buildArtefaktyDetail,
  buildArtefaktyError,
  resolveArtefaktyCategory
} = require('../utils/artefactHelpSystem');

const eventItemIds = [
  'szkarlatne_oko', 'cien_nocy', 'wampirzy_sztylet', 'szwajcarski_klucz', 'krysztal_doswiadczenia',
  'ananas_na_pizzy', 'czarna_bandera', 'kosci_oszusta', 'czterolistna_moneta', 'czarna_karta'
];

const getNonEventItems = () => {
  const list = [];
  let num = 1;
  for (const [id, def] of Object.entries(config.shopItems || {})) {
    const isPermanent = def.type === 'permanent';
    const isStackable = def.type === 'stackable';
    const isPackage = id.startsWith('paczka_');
    const isEvent = eventItemIds.includes(id);
    if ((!isPermanent && !isStackable) || isPackage || isEvent || id === 'karta_vip') continue;
    list.push({
      num,
      id,
      name: def.name,
      emoji: def.emoji,
      shortDesc: def.shortDesc || def.description,
      description: def.description,
      price: def.price || 0,
      buyable: def.buyable,
      shopNote: def.shopNote || null
    });
    num++;
  }
  return list;
};

module.exports = {
  name: 'artefakty',
  aliases: ['artf', 'artefakt', 'itemy', 'przedmioty'],
  getNonEventItems,
  getEventItems: () => {
    const list = [];
    for (const [key, item] of Object.entries(eventItems)) {
      list.push({
        num: parseInt(key, 10),
        id: item.id,
        name: item.name,
        emoji: item.emoji,
        shortDesc: item.desc,
        description: item.desc,
        award: item.award
      });
    }
    return list;
  },
  async execute(client, message, args) {
    const userId = message.author.id;
    const standardItems = getNonEventItems();
    const eventItemsList = this.getEventItems();

    if (!args.length) {
      client.pendingArtefakty = client.pendingArtefakty || new Map();
      const senderId = message.author.id;
      const rawThreadId = message.rawEvent?.threadID || message.guild?.id;
      const threadId = rawThreadId === 'messenger' ? undefined : (rawThreadId?.replace?.('page:', '') || rawThreadId);

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
    const secondArg = String(args[1] || '').toLowerCase();
    const thirdArg = String(args[2] || '').toLowerCase();

    const categoryKey = resolveArtefaktyCategory(firstArg);
    const isHelpCall = firstArg === 'help' || firstArg === 'info' || secondArg === 'help' || secondArg === 'info';

    let numParam = null;
    let resolvedCategoryKey = null;

    if (isHelpCall) {
      if (firstArg === 'help' || firstArg === 'info') {
        const catNum = parseInt(args[1], 10);
        if (catNum === 1) {
          resolvedCategoryKey = 'standardowe';
        } else if (catNum === 2) {
          resolvedCategoryKey = 'eventowe';
        } else {
          resolvedCategoryKey = null;
        }
        numParam = parseInt(args[2], 10);
      } else {
        numParam = parseInt(firstArg, 10);
        resolvedCategoryKey = categoryKey;
      }
    } else if (!isNaN(parseInt(firstArg, 10))) {
      numParam = parseInt(firstArg, 10);
      resolvedCategoryKey = args[1] ? resolveArtefaktyCategory(args[1]) : null;
    } else {
      resolvedCategoryKey = categoryKey;
    }

    if (resolvedCategoryKey) {
      if (numParam !== null) {
        let resolved = null;
        if (resolvedCategoryKey === 'standardowe') {
          const item = standardItems.find(a => a.num === numParam);
          resolved = item ? { item, type: 'standard' } : null;
        } else {
          const item = eventItemsList.find(a => a.num === numParam);
          resolved = item ? { item, type: 'event' } : null;
        }

        if (!resolved || !resolved.item) {
          await message.reply(`❌ Nie znaleziono przedmiotu o numerze **${numParam}** w kategorii **${resolvedCategoryKey}**. Użyj: **!artefakty ${resolvedCategoryKey}** aby zobaczyć listę.`);
          return;
        }

        const ownedStatus = await withData(store => {
          const inv = ensureInventoryRecord(store.inventory, userId);
          const qty = inv[resolved.item.id] || 0;
          const level = getItemUpgradeLevel(inv, resolved.item.id);
          const upgradeStr = level > 0 ? ` (poziom +${level})` : '';
          return qty > 0 ? `🟢 Posiadasz (sztuk: ${qty}${upgradeStr})` : '🔴 Nie posiadasz';
        });

        const response = buildArtefaktyDetail(resolvedCategoryKey, resolved.item, ownedStatus);
        await message.reply({ embeds: [response] });
        return;
      }

      const items = resolvedCategoryKey === 'standardowe' ? standardItems : eventItemsList;
      const response = buildArtefaktyCategoryList(resolvedCategoryKey, items);
      await message.reply({ embeds: [response] });
      return;
    }

    if (numParam !== null) {
      const resolved = getItemByGlobalNum(numParam, standardItems, eventItemsList);
      if (!resolved || !resolved.item) {
        await message.reply(`❌ Nie znaleziono przedmiotu o numerze **${numParam}**. Użyj: **!artefakty** aby zobaczyć listę.`);
        return;
      }

      const ownedStatus = await withData(store => {
        const inv = ensureInventoryRecord(store.inventory, userId);
        const qty = inv[resolved.item.id] || 0;
        const level = getItemUpgradeLevel(inv, resolved.item.id);
        const upgradeStr = level > 0 ? ` (poziom +${level})` : '';
        return qty > 0 ? `🟢 Posiadasz (sztuk: ${qty}${upgradeStr})` : '🔴 Nie posiadasz';
      });

      const response = buildArtefaktyDetail(resolved.type === 'event' ? 'eventowe' : 'standardowe', resolved.item, ownedStatus);
      await message.reply({ embeds: [response] });
      return;
    }

    await message.reply({ embeds: [buildArtefaktyError()] });
  }
};

function getItemByGlobalNum(num, standardItems, eventItemsList) {
  if (num >= 1 && num <= standardItems.length) {
    return { item: standardItems[num - 1], type: 'standard' };
  }
  const eventOffset = standardItems.length;
  if (num > eventOffset && num <= eventOffset + eventItemsList.length) {
    return { item: eventItemsList[num - eventOffset - 1], type: 'event' };
  }
  return null;
}
