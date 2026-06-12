const { withData } = require('../utils/storage');
const config = require('../config/config');

module.exports = {
  name: 'prefix',
  aliases: [],
  async execute(client, message, args) {
    const threadId = message.guild.id;
    const senderId = message.author.id;
    const currentPrefix = message.prefix || '!';

    // 1. Wyświetlenie aktualnego prefixu w przypadku braku podania argumentów
    if (args.length === 0) {
      await message.reply(`ℹ️ Aktualny prefix bota na tej grupie to: **${currentPrefix}**\nAby go zmienić, wpisz: **${currentPrefix}prefix <nowy_prefix>**`);
      return;
    }

    // 2. Blokowanie wywołania zmiany na czacie prywatnym
    if (threadId === senderId) {
      await message.reply('❌ Prefix bota można zmienić tylko na czacie grupowym.');
      return;
    }

    const newPrefix = args[0].trim();

    // 3. Walidacja nowego prefixu (np. max 3 znaki)
    if (newPrefix.length === 0) {
      await message.reply(`ℹ️ Aktualny prefix bota na tej grupie to: **${currentPrefix}**\nAby go zmienić, wpisz: **${currentPrefix}prefix <nowy_prefix>**`);
      return;
    }

    if (newPrefix.length > 3) {
      await message.reply('❌ Nowy prefix nie może być dłuższy niż 3 znaki.');
      return;
    }

    // 4. Sprawdzenie uprawnień: tylko admin grupy lub admin bota
    try {
      const creatorId = '100060812419294';
      const isCreator = (senderId === creatorId);

      // Sprawdzenie, czy prefix był ustawiony przez twórcę bota
      let isSetByCreator = false;
      await withData(store => {
        if (store.profiles.threadSettings && store.profiles.threadSettings[threadId]) {
          isSetByCreator = store.profiles.threadSettings[threadId].prefixSetByCreator === true;
        }
      });

      if (isSetByCreator && !isCreator) {
        await message.reply('❌ Ten prefix został ustawiony przez twórcę bota i nie może zostać zmieniony.');
        return;
      }

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

      const isGroupAdmin = adminIDs.includes(senderId);
      const isBotAdmin = config.admins.includes(senderId);

      if (!isGroupAdmin && !isBotAdmin) {
        await message.reply('❌ Tylko administratorzy tej grupy lub administrator bota mogą zmienić prefix.');
        return;
      }

      // 5. Zapis nowego prefixu do bazy danych
      await withData(store => {
        store.profiles.threadSettings = store.profiles.threadSettings || {};
        store.profiles.threadSettings[threadId] = store.profiles.threadSettings[threadId] || {};
        store.profiles.threadSettings[threadId].prefix = newPrefix;
        if (isCreator) {
          if (newPrefix === '!') {
            store.profiles.threadSettings[threadId].prefixSetByCreator = false;
          } else {
            store.profiles.threadSettings[threadId].prefixSetByCreator = true;
          }
        } else {
          store.profiles.threadSettings[threadId].prefixSetByCreator = false;
        }
      });

      await message.reply(`✅ Pomyślnie zmieniono prefix bota na tej grupie na: **${newPrefix}**\nOd teraz wszystkie komendy wywołujemy za pomocą np. **${newPrefix}help**`);

    } catch (err) {
      console.error('[PREFIX CMD] Błąd podczas pobierania getThreadInfo:', err);
      await message.reply('❌ Wystąpił błąd podczas sprawdzania uprawnień administratora grupy.');
    }
  }
};
