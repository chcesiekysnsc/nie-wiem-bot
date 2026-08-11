const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { withData, DATA_DIR } = require('../utils/storage');

module.exports = {
  name: 'odtworz',
  aliases: ['restore', 'import', 'przywroc'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Brak uprawnień do tej komendy.');
      return;
    }

    let fileUrl = '';

    // 1. Sprawdź, czy użytkownik załączył plik do tej wiadomości
    if (message.attachments && message.attachments.length > 0) {
      fileUrl = message.attachments[0].url;
    }
    // 2. Sprawdź, czy użytkownik odpowiada na wiadomość z załącznikiem
    else if (message.messageReply && message.messageReply.attachments && message.messageReply.attachments.length > 0) {
      fileUrl = message.messageReply.attachments[0].url;
    }
    // 3. Sprawdź, czy użytkownik podał link jako argument
    else if (args.length > 0 && args[0].startsWith('http')) {
      fileUrl = args[0];
    }

    if (!fileUrl) {
      await message.reply(
        'ℹ️ **Jak przywrócić bazę danych na nowym Railway?**\n\n' +
        '1. Wyślij pobrany wcześniej plik `backup_database.json` na czat z botem.\n' +
        '2. Odpowiedz (reply) na tę wiadomość z plikiem, wpisując: **!odtworz**\n' +
        '*(Alternatywnie możesz wpisać: !odtworz <link_do_pliku_json>)*'
      );
      return;
    }

    await message.reply('⏳ Pobieram i weryfikuję plik kopii zapasowej...');

    try {
      const response = await axios.get(fileUrl, { responseType: 'json' });
      const backup = response.data;

      if (!backup || typeof backup !== 'object' || Object.keys(backup).length === 0) {
        await message.reply('❌ Pobrany plik nie jest poprawnym formatem kopii zapasowej.');
        return;
      }

      await message.reply('📦 Rozpoczynam bezproblemowe przywracanie danych do pamięci bota...');

      let restoredCount = 0;
      let skippedCount = 0;

      // Zaktualizuj bazę w pamięci RAM w bezpiecznej transakcji withData
      await withData(store => {
        for (const fileName of Object.keys(backup)) {
          if (!fileName.endsWith('.json') || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
            skippedCount++;
            continue;
          }

          const fileKey = fileName.replace('.json', '');
          const content = backup[fileName];
          const targetPath = path.join(DATA_DIR, fileName);

          if (fileName === 'appstate.json' && fs.existsSync(targetPath)) {
            skippedCount++;
            continue;
          }

          if (store[fileKey] !== undefined) {
            const target = store[fileKey];

            if (typeof content === 'object' && content !== null) {
              if (Array.isArray(content)) {
                // Czyszczenie i przepisywanie tablicy (np. logs)
                target.length = 0;
                target.push(...content);
              } else {
                // Czyszczenie i przepisywanie obiektu (np. users, profiles, inventory)
                for (const k of Object.keys(target)) {
                  delete target[k];
                }
                Object.assign(target, content);
              }
              restoredCount++;
            } else {
              skippedCount++;
            }
          } else {
            skippedCount++;
          }
        }
      });

      await message.reply(
        `🎉 **PRZYWRACANIE ZAKOŃCZONE POMYŚLNIE!** 🎉\n\n` +
        `✅ Przywrócone sekcje bazy danych: **${restoredCount}**\n` +
        `⚠️ Pominięte elementy: **${skippedCount}**\n\n` +
        `🤖 Wszystkie dane zostały zaimportowane do pamięci RAM bota i zapisane na dysku. Bot działa już na starej bazie!`
      );

    } catch (err) {
      console.error('[RESTORE CMD] Błąd przywracania:', err);
      await message.reply(`❌ Wystąpił krytyczny błąd podczas importowania: ${err.message}`);
    }
  }
};
