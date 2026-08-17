const { withData } = require('../utils/storage');
const { ensureInventoryRecord } = require('../utils/economy');

module.exports = {
  name: 'itemaupg',
  aliases: ['aupgitem', 'itemupgradeall'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const lvl = parseInt(args[0], 10);
    if (isNaN(lvl) || lvl < 0 || lvl > 5) {
      await message.reply('❌ Użyj: **!itemaupg <poziom>** (od 0 do 5).');
      return;
    }

    await withData(store => {
      const inv = ensureInventoryRecord(store.inventory, creatorId);
      inv._upgrades = inv._upgrades || {};

      // Pobierz wszystkie przedmioty w ekwipunku (klucze inne niż _upgrades, o ilości > 0)
      const itemIds = Object.keys(inv).filter(key => key !== '_upgrades' && inv[key] > 0);

      for (const itemId of itemIds) {
        inv._upgrades[itemId] = {
          level: lvl,
          lastUpgradeAt: Date.now()
        };
      }
    });

    await message.reply(`✅ Pomyślnie ustawiłeś poziom ulepszenia **+${lvl}** dla wszystkich przedmiotów w swoim ekwipunku!`);
  }
};
