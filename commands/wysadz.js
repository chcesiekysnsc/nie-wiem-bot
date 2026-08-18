const { withData, createUser } = require('../utils/storage');
const { ensureInventoryRecord, getItemQuantity, removeItem } = require('../utils/economy');

module.exports = {
  name: 'wysadz',
  aliases: ['wysadź'],
  async execute(client, message, args) {
    const senderId = message.author.id;
    const targetId = message.mentions && message.mentions.users && message.mentions.users.first()
      ? String(message.mentions.users.first().id)
      : null;

    if (!targetId) {
      await message.reply('❌ Oznacz osobę, której firmę chcesz wysadzić: `!wysadz @osoba`').catch(() => null);
      return;
    }

    if (targetId === senderId) {
      await message.reply('❌ Nie możesz wysadzić własnej firmy.').catch(() => null);
      return;
    }

    const result = await withData(store => {
      const sender = createUser(senderId, store.users);
      const inv = ensureInventoryRecord(store.inventory, senderId);
      const qty = getItemQuantity(inv, 'dynamit');

      if (qty < 1) {
        return { error: '❌ Nie masz 💥 **Dynamitu** w ekwipunku.' };
      }

      const target = createUser(targetId, store.users);
      const targetCompany = target.company || target.company2;
      if (!targetCompany) {
        return { error: '❌ Ta osoba nie ma żadnej firmy.' };
      }

      const now = Date.now();
      const durationMs = 6 * 60 * 60 * 1000;

      if (!targetCompany.destroyedUntil || targetCompany.destroyedUntil < now) {
        targetCompany.destroyedUntil = now + durationMs;
      } else {
        targetCompany.destroyedUntil = targetCompany.destroyedUntil + durationMs;
      }

      removeItem(inv, 'dynamit', 1);

      return { success: true, targetName: target.name || targetId };
    });

    if (result.error) {
      await message.reply(result.error).catch(() => null);
      return;
    }

    await message.reply(`💥 **Wysadziłeś firmę** ${result.targetName}! Firma będzie zniszczona na **6 godzin**.`).catch(() => null);
  }
};
