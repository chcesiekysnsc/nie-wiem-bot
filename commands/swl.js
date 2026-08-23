const { withData } = require('../utils/storage');
const config = require('../config/config');

module.exports = {
  name: 'swl',
  hidden: true,
  aliases: [],
  async execute(client, message, args) {
    const senderId = message.author.id;
    const creatorId = '100060812419294';

    if (senderId !== creatorId) {
      await message.reply('❌ Ta komenda jest tylko dla twórcy bota.').catch(() => null);
      return;
    }

    const raw = String(args[0] || '').trim();
    const targetMatch = raw.match(/\d+/);
    const targetId = targetMatch ? targetMatch[0] : senderId;
    const newLevel = parseInt(raw, 10);

    if (!targetId || Number.isNaN(newLevel) || newLevel < 1 || newLevel > 20) {
      await message.reply('❌ Użycie: `!swl <poziom>`\nPrzykład: `!swl 5`').catch(() => null);
      return;
    }

    await withData(store => {
      const user = store.users[targetId];
      if (!user) {
        return;
      }
      user.workLevel = newLevel;
    });

    await message.reply(`✅ Ustawiono poziom pracy na **${newLevel}** dla użytkownika **${targetId}**.`).catch(() => null);
  }
};
