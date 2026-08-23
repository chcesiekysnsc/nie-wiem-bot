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

    const newLevel = parseInt(args[0], 10);

    if (Number.isNaN(newLevel) || newLevel < 1 || newLevel > 20) {
      await message.reply('❌ Użycie: `!swl <poziom>` lub `!swl <poziom> <oznaczenie/id>`\nPrzykład: `!swl 5` lub `!swl 5 @użytkownik`').catch(() => null);
      return;
    }

    let targetId = creatorId; // Domyślnie dla twórcy

    // Sprawdź czy podano oznaczenie lub ID
    if (args[1]) {
      const mentionMatch = args[1].match(/\d+/);
      if (mentionMatch) {
        targetId = mentionMatch[0];
      } else {
        await message.reply('❌ Nieprawidłowe oznaczenie lub ID użytkownika.').catch(() => null);
        return;
      }
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
