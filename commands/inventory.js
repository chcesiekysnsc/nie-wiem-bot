const config = require('../config/config');
const { infoEmbed } = require('../utils/embeds');
const {
  ensureInventoryRecord,
  formatCurrency,
  getBankCapacity,
  refreshBadges
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'inventory',
  aliases: ['inv'],
  async execute(client, message) {
    const target = message.mentions.users.first() || message.author;

    const result = await withData(store => {
      const user = createUser(target.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, target.id);
      refreshBadges(user, inventory);

      const items = Object.entries(inventory)
        .filter(([, quantity]) => quantity > 0)
        .map(([itemId, quantity]) => {
          const item = config.shopItems[itemId];
          return item
            ? `${item.emoji} **${item.name}** x${quantity}`
            : `📦 **${itemId}** x${quantity}`;
        });

      return {
        items,
        badges: user.badges,
        bankCapacity: getBankCapacity(user, inventory)
      };
    });

    const embed = infoEmbed(
      'Inventory',
      result.items.length ? result.items.join('\n') : 'Brak przedmiotow w inventory.'
    )
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Badges', value: result.badges.length ? result.badges.join(', ') : 'Brak', inline: false },
        { name: 'Pojemnosc banku', value: formatCurrency(result.bankCapacity), inline: true }
      );

    await message.reply({ embeds: [embed] });
  }
};
