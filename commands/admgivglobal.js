const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord, resolveAmount, addItem } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'admgivglobal',
  aliases: ['giveallglobal', 'agg', 'aggi'],
  async execute(client, message, args) {
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    // Determine which mode based on the alias used
    const usedCommand = (message.content || '').trim().split(/\s+/)[0].replace('!', '').toLowerCase();
    const isItemMode = usedCommand === 'aggi';

    if (isItemMode) {
      // !aggi <nr_itema> <ilość>
      const itemNumber = parseInt(args[0]);
      const quantity = parseInt(args[1]) || 1;

      if (!itemNumber || itemNumber < 1) {
        // Build item list for help
        const itemList = Object.entries(config.shopItems)
          .map(([id, item], index) => `  ${index + 1}. ${item.emoji} ${item.name} (${id})`)
          .join('\n');
        await message.reply(`❌ Użyj: **!aggi <nr_itema> <ilość>**\n\n📦 Dostępne itemy:\n${itemList}`);
        return;
      }

      const itemEntries = Object.entries(config.shopItems);
      if (itemNumber < 1 || itemNumber > itemEntries.length) {
        await message.reply(`❌ Nieprawidłowy numer itemu. Dostępne: 1-${itemEntries.length}`);
        return;
      }

      const [itemId, itemInfo] = itemEntries[itemNumber - 1];

      if (quantity < 1 || quantity > 100) {
        await message.reply('❌ Ilość musi być od 1 do 100.');
        return;
      }

      const count = await withData(store => {
        let updatedCount = 0;
        const userIds = Object.keys(store.users || {});
        for (const uid of userIds) {
          const user = createUser(uid, store.users);
          if ((user.commandsUsed || 0) <= 20) {
            continue;
          }
          const inventory = ensureInventoryRecord(store.inventory, uid);
          addItem(inventory, itemId, quantity);
          refreshBadges(user, inventory);
          updatedCount++;
        }
        return updatedCount;
      });

      await message.reply(`🎁 Admin rozdał globalnie **${quantity}x ${itemInfo.emoji} ${itemInfo.name}** dla wszystkich graczy z >20 komend! (Rozdano do: ${count} osób)`);
    } else {
      // !agg <kwota> or !admgivglobal <kwota>
      const amount = resolveAmount(args[0], 999999999999);
      if (!amount || amount <= 0) {
        await message.reply('❌ Użyj: **!agg <kwota>** lub **!admgivglobal <kwota>**');
        return;
      }

      const count = await withData(store => {
        let updatedCount = 0;
        const userIds = Object.keys(store.users || {});
        for (const uid of userIds) {
          const user = createUser(uid, store.users);
          if ((user.commandsUsed || 0) <= 20) {
            continue;
          }
          const inventory = ensureInventoryRecord(store.inventory, uid);
          user.balance += amount;
          refreshBadges(user, inventory);
          updatedCount++;
        }
        return updatedCount;
      });

      await message.reply(`🎁 Admin rozdał po **${formatCurrency(amount)}** globalnie dla wszystkich zarejestrowanych graczy mających ponad 20 użytych komend! (Rozdano do: ${count} osób)`);
    }
  }
};
