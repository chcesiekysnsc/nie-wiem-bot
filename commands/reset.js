const config = require('../config/config');
const { withData } = require('../utils/storage');

module.exports = {
  name: 'reset',
  aliases: [],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień do tej komendy.');
      return;
    }

    const percent = Math.floor(Number(args[0]));
    if (isNaN(percent) || percent < 1 || percent > 100) {
      await message.reply('❌ Użyj: `!reset <procent 1-100>` (np. `!reset 10` usuwa 10% monet).');
      return;
    }

    const count = await withData(store => {
      let updatedCount = 0;
      for (const uid of Object.keys(store.users)) {
        const user = store.users[uid];
        if (user) {
          user.balance = Math.max(0, Math.round(user.balance * (1 - percent / 100)));
          user.bank = Math.max(0, Math.round(user.bank * (1 - percent / 100)));
          updatedCount++;
        }
      }
      return updatedCount;
    });

    await message.reply(`💸 Pomyślnie usunięto **${percent}%** środków (portfel + bank) z kont wszystkich graczy (zaktualizowano: ${count} kont).`);
  }
};
