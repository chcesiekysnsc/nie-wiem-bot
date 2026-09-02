const config = require('../config/config');
const { createUser, withData } = require('../utils/storage');

const CREATOR_ID = '100060812419294';

function resolveTargetId(message, args) {
  const mentioned = message.mentions && message.mentions.users && message.mentions.users.first();
  if (mentioned) {
    return mentioned.id;
  }
  const raw = (args[0] || '').trim();
  if (/^\d+$/.test(raw)) {
    return raw;
  }
  return null;
}

module.exports = {
  name: 'dailyset',
  aliases: [],
  async execute(client, message, args) {
    if (message.author.id !== CREATOR_ID) {
      await message.reply('❌ Tylko twórca bota może używać tej komendy.');
      return;
    }

    if (!args[0] || !args[1]) {
      await message.reply('❌ Użycie: **!dailyset <oznaczenie/id> <streak>**\nPrzykład: `!dailyset @osoba 15` lub `!dailyset 123456789 20`');
      return;
    }

    const targetId = resolveTargetId(message, args);
    if (!targetId) {
      await message.reply('❌ Podaj poprawne oznaczenie użytkownika lub jego ID.');
      return;
    }

    const streak = parseInt(args[1], 10);
    if (isNaN(streak) || streak < 1) {
      await message.reply('❌ Podaj poprawną liczbę streak (minimum 1).');
      return;
    }

    const result = await withData(store => {
      const user = createUser(targetId, store.users);
      const previousStreak = user.dailyStreak || 0;
      user.dailyStreak = streak;
      return { success: true, streak, previousStreak };
    });

    if (result.success) {
      await message.reply(`✅ Ustawiono streak **${result.streak}** dla użytkownika **${targetId}**.\nPoprzedni streak: **${result.previousStreak}**`);
    }
  }
};
