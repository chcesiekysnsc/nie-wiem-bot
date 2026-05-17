const config = require('../config/config');
const { errorEmbed, infoEmbed, successEmbed } = require('../utils/embeds');
const {
  addItem,
  addXp,
  ensureInventoryRecord,
  formatCurrency,
  hasItem,
  refreshBadges
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

function renderShopList() {
  return Object.entries(config.shopItems)
    .map(([itemId, item]) => `${item.emoji} **${item.name}** - \`${itemId}\`\n${formatCurrency(item.price)} - ${item.description}`)
    .join('\n\n');
}

module.exports = {
  name: 'shop',
  aliases: ['store'],
  async execute(client, message, args) {
    const action = String(args[0] || '').toLowerCase();

    if (!action || action === 'list') {
      const embed = infoEmbed('Casino Shop', renderShopList())
        .addFields({ name: 'Zakup', value: 'Uzyj `!shop buy <itemId> [ilosc]`.', inline: false });

      await message.reply({ embeds: [embed] });
      return;
    }

    if (action !== 'buy') {
      await message.reply({
        embeds: [errorEmbed('Shop', 'Dostepne akcje: `!shop` albo `!shop buy <itemId> [ilosc]`.')]
      });
      return;
    }

    const itemId = String(args[1] || '').toLowerCase();
    const item = config.shopItems[itemId];

    if (!item) {
      await message.reply({
        embeds: [errorEmbed('Shop', 'Nie znaleziono takiego itemu w sklepie.')]
      });
      return;
    }

    const requestedQuantity = Math.floor(Number(args[2] || 1));
    const quantity = item.type === 'permanent' ? 1 : Math.max(1, Number.isFinite(requestedQuantity) ? requestedQuantity : 1);

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);

      if (item.type === 'permanent' && hasItem(inventory, itemId)) {
        return { error: 'Ten permanent item juz posiadasz.' };
      }

      const totalPrice = item.price * quantity;
      if (user.balance < totalPrice) {
        return { error: `Potrzebujesz ${formatCurrency(totalPrice)}.` };
      }

      user.balance -= totalPrice;
      addItem(inventory, itemId, quantity);
      addXp(user, 10);
      refreshBadges(user, inventory);

      return {
        quantity,
        totalPrice,
        balance: user.balance
      };
    });

    if (result.error) {
      await message.reply({ embeds: [errorEmbed('Shop', result.error)] });
      return;
    }

    const embed = successEmbed('Zakup udany', `Kupiles **${item.name}** x${result.quantity}.`)
      .addFields(
        { name: 'Cena', value: formatCurrency(result.totalPrice), inline: true },
        { name: 'Balance po zakupie', value: formatCurrency(result.balance), inline: true }
      );

    await message.reply({ embeds: [embed] });
  }
};
