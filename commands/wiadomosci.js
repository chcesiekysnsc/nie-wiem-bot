const { withData } = require('../utils/storage');
const config = require('../config/config');

module.exports = {
  name: 'wiadomosci',
  aliases: ['wiadomości', 'delmsglog'],
  async execute(client, message, args) {
    const threadId = message.guild.id;
    const senderId = message.author.id;

    // Sprawdź, czy komenda została wywołana na czacie grupowym
    if (threadId === senderId) {
      await message.reply('❌ Tę komendę można wywołać tylko na czacie grupowym.');
      return;
    }

    const sub = String(args[0] || '').toLowerCase().trim();
    if (sub !== 'on' && sub !== 'off') {
      await message.reply('ℹ️ Użycie: **!wiadomosci <on|off>**');
      return;
    }

    // Pobierz info o wątku z FB, aby sprawdzić, czy użytkownik jest adminem grupy
    try {
      const getThreadInfo = (api, tId) => {
        return new Promise((resolve, reject) => {
          api.getThreadInfo(tId, (err, info) => {
            if (err) return reject(err);
            resolve(info);
          });
        });
      };

      const threadInfo = await getThreadInfo(client.api, threadId);
      const adminIDs = threadInfo.adminIDs || [];

      // Sprawdź uprawnienia: admin grupy na FB lub admin bota w configu
      const isGroupAdmin = adminIDs.includes(senderId);
      const isBotAdmin = config.admins.includes(senderId);

      if (!isGroupAdmin && !isBotAdmin) {
        await message.reply('❌ Tylko administratorzy tej grupy mogą zmieniać to ustawienie.');
        return;
      }

      const enabled = (sub === 'on');

      // Zapisz ustawienie w profilu wątku
      await withData(store => {
        store.profiles.threadSettings = store.profiles.threadSettings || {};
        store.profiles.threadSettings[threadId] = store.profiles.threadSettings[threadId] || {};
        store.profiles.threadSettings[threadId].unsendLoggingEnabled = enabled;
      });

      if (enabled) {
        await message.reply('✅ Oznaczanie usuniętych wiadomości zostało **WŁĄCZONE** w tej grupie.');
      } else {
        await message.reply('❌ Oznaczanie usuniętych wiadomości zostało **WYŁĄCZONE** w tej grupie.');
      }

    } catch (err) {
      console.error('[WIADOMOSCI CMD] Blad podczas pobierania getThreadInfo:', err);
      await message.reply('❌ Wystąpił błąd podczas sprawdzania uprawnień administratora grupy.');
    }
  }
};
