const { withData } = require('../utils/storage');
const config = require('../config/config');

module.exports = {
  name: 'kubl',
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
    let targetId = null;

    if (message.mentions && message.mentions.users && message.mentions.users.first()) {
      targetId = String(message.mentions.users.first().id);
    } else {
      const match = raw.match(/\d{8,32}/);
      targetId = match ? match[0] : null;
    }

    if (!targetId) {
      await message.reply('❌ Podaj ID lub oznacz użytkownika: `!kubl <id>`').catch(() => null);
      return;
    }

    await withData(store => {
      if (!store.profiles.blacklist) store.profiles.blacklist = [];
      if (!store.profiles.trueBlacklist) store.profiles.trueBlacklist = [];

      store.profiles.blacklist = store.profiles.blacklist.filter(id => id !== targetId);
      store.profiles.trueBlacklist = store.profiles.trueBlacklist.filter(id => id !== targetId);

      if (store.users[targetId]) {
        store.users[targetId].blacklistedForNegativeBalance = false;
        store.users[targetId].negativeSince = null; // Resetuj czas ujemnego salda
      }

      if (store.profiles.workBotBans && store.profiles.workBotBans[targetId]) {
        delete store.profiles.workBotBans[targetId];
      }

      if (store.cooldowns && store.cooldowns.spam && store.cooldowns.spam[targetId]) {
        store.cooldowns.spam[targetId].blockedUntil = 0;
        store.cooldowns.spam[targetId].timestamps = [];
      }
    });

    try {
      const pool = require('../database/config');
      await pool.query('UPDATE spam_entries SET blacklisted = false, blocked_until = NULL, warning_count = 0 WHERE user_id = $1', [targetId]);
    } catch (err) {
      console.error('[KUBL] Błąd czyszczenia spam_entries:', err);
    }

    await message.reply(`✅ Użytkownik \`${targetId}\` został usunięty z WSZYSTKICH czarnych list.`).catch(() => null);
  }
};
