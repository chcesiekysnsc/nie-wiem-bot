const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../utils/storage');

function safeSend(api, content, threadID) {
  return new Promise((resolve) => {
    let completed = false;
    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.warn('[DANE] safeSend timed out');
        resolve(false);
      }
    }, 10000);

    api.sendMessage(content, threadID, (err) => {
      clearTimeout(timeout);
      if (completed) return;
      completed = true;
      if (err) {
        console.error('[DANE] safeSend error:', err);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

module.exports = {
  name: 'dane',
  aliases: ['backup', 'kopia', 'dbbackup'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Brak uprawnień do tej komendy.');
      return;
    }

    if (!client.api) {
      await message.reply('❌ API nie jest dostępne.');
      return;
    }

    const threadId = message.rawEvent?.threadID || message.threadID;
    if (!threadId) {
      await message.reply('❌ Nie można określić ID konwersacji.');
      return;
    }

    await message.reply('📦 Przygotowuję aktualną kopię zapasową bazy danych...');

    const dataDir = DATA_DIR;
    if (!fs.existsSync(dataDir)) {
      await safeSend(client.api, '❌ Folder data/ nie istnieje.', threadId);
      return;
    }

    try {
      const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
      if (files.length === 0) {
        await safeSend(client.api, '❌ Brak plików bazy danych (.json) w folderze data/.', threadId);
        return;
      }

      const consolidated = {};

      for (const file of files) {
        const filePath = path.join(dataDir, file);
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          continue;
        }

        try {
          const content = fs.readFileSync(filePath, 'utf8');
          consolidated[file] = JSON.parse(content);
        } catch (e) {
          consolidated[file] = fs.readFileSync(filePath, 'utf8');
        }
      }

      const backupString = JSON.stringify(consolidated, null, 2);
      console.log(`[DANE] Prepared backup of size ${backupString.length} characters.`);

      const key = Math.random().toString(36).substring(2, 12);
      global.backupKey = key;
      global.latestBackup = backupString;

      const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
      let downloadUrl = '';
      if (publicDomain) {
        downloadUrl = `https://${publicDomain.replace(/\/$/, '')}/backup?key=${key}`;
      } else {
        downloadUrl = `http://[twoj-adres-bota].up.railway.app/backup?key=${key}\n*(Zastąp [twoj-adres-bota] domeną swojego bota, którą znajdziesz w panelu Railway w zakładce Settings -> Public Networking -> Domain)*`;
      }

      await safeSend(client.api, `✅ **Kopia zapasowa gotowa!**\n\nMożesz ją pobrać bezpośrednio ze swojego serwera bota:\n🔗 **Pobierz stąd:** ${downloadUrl}\n\nOtwórz ten link w przeglądarce, a plik \`backup_database.json\` pobierze się automatycznie.`, threadId);
    } catch (err) {
      console.error('[DANE] Error exporting database files:', err);
      const errMsg = err.message || err.error || (typeof err === 'object' ? JSON.stringify(err) : err);
      await safeSend(client.api, `❌ Wystąpił błąd podczas tworzenia kopii: ${errMsg}`, threadId);
    }
  }
};
