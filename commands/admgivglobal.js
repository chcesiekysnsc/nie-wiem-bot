const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord, resolveAmount } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'admgivglobal',
  aliases: ['giveallglobal'],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień do tej komendy.');
      return;
    }

    const amount = resolveAmount(args[0], 999999999999);
    if (!amount || amount <= 0) {
      await message.reply('❌ Użyj: **!admgivglobal <kwota>**');
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
};
