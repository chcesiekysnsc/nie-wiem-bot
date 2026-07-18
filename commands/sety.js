const { ensureInventoryRecord } = require('../utils/economy');
const { withData } = require('../utils/storage');
const { getSetDefinitions, isSetComplete } = require('../utils/itemSets');

module.exports = {
  name: 'sety',
  aliases: ['sets', 'zestawy', 'zestaw'],
  async execute(client, message, args) {
    const userId = message.author.id;
    const sets = getSetDefinitions();

    const numParam = parseInt(args[0], 10);
    if (Number.isFinite(numParam) && numParam >= 1 && numParam <= sets.length) {
      const set = sets[numParam - 1];

      const inventory = await withData(store => ensureInventoryRecord(store.inventory, userId));
      const complete = isSetComplete(set, inventory);

      const itemsLines = set.requiredItems.map(itemId => {
        const owned = (inventory[itemId] || 0) > 0;
        return `${owned ? '✅' : '❌'} ${itemId}`;
      }).join('\n');

      const bonusLines = set.bonuses.map(b => `• ${b.label}`).join('\n');

      await message.reply(
        `${set.emoji} **${set.name.toUpperCase()}** ${set.emoji}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `**Status:** ${complete ? '🟢 Kompletny (bonus aktywny!)' : '🔴 Niekompletny'}\n\n` +
        `**Wymagane przedmioty:**\n${itemsLines}\n\n` +
        `**Bonus po skompletowaniu:**\n${bonusLines}`
      );
      return;
    }

    const inventory = await withData(store => ensureInventoryRecord(store.inventory, userId));

    const lines = sets.map((set, idx) => {
      const complete = isSetComplete(set, inventory);
      const ownedCount = set.requiredItems.filter(id => (inventory[id] || 0) > 0).length;
      const status = complete ? '🟢 Kompletny' : `🔴 ${ownedCount}/${set.requiredItems.length}`;
      const bonusText = set.bonuses.map(b => `${b.label}`).join(' ');
      return `${idx + 1}. ${set.emoji} **${set.name}** — ${status}\n❗️${bonusText}❗️`;
    });

    await message.reply(
      `🧩 **SETY PRZEDMIOTÓW**\n` +
      `Skompletuj zestawy istniejących przedmiotów, aby otrzymać dodatkowe bonusy!\n\n` +
      lines.join('\n\n') + `\n\n` +
      `💡 Szczegóły i wymagane przedmioty: **!sety <numer>**`
    );
  }
};
