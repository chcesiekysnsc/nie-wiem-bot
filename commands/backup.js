const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Safe send helper to prevent hanging if Facebook API doesn't trigger the callback
function safeSend(api, content, threadID) {
  return new Promise((resolve) => {
    let completed = false;
    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.warn('[BACKUP] safeSend timed out');
        resolve(false);
      }
    }, 10000); // 10s timeout per message

    api.sendMessage(content, threadID, (err) => {
      clearTimeout(timeout);
      if (completed) return;
      completed = true;
      if (err) {
        console.error('[BACKUP] safeSend error:', err);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

module.exports = {
  name: 'backup',
  aliases: ['kopia', 'dbbackup'],
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

    await message.reply('📦 Przygotowuję jedną skonsolidowaną kopię zapasową bazy danych...');

    const dataDir = path.join(__dirname, '../data');
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
          // If not valid JSON, save as raw text
          consolidated[file] = fs.readFileSync(filePath, 'utf8');
        }
      }

      const backupString = JSON.stringify(consolidated, null, 2);
      console.log(`[BACKUP] Uploading consolidated backup (${backupString.length} characters)...`);

      // Upload consolidated JSON to paste.rs
      let url = null;
      try {
        const response = await axios.post('https://paste.rs/', backupString, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000 // 15s timeout
        });
        if (response.data && String(response.data).startsWith('http')) {
          url = response.data.trim();
        }
      } catch (uploadErr) {
        console.error('[BACKUP] Failed to upload consolidated backup to paste.rs:', uploadErr.message);
      }

      if (url) {
        await safeSend(client.api, `✅ **Kopia zapasowa gotowa!**\n\nWszystkie dane zostały spakowane do jednego linku.\n🔗 **Pobierz stąd:** ${url}\n\nWyślij mi ten link tutaj w naszej rozmowie!`, threadId);
      } else {
        await safeSend(client.api, `⚠️ Nie udało się utworzyć linku na paste.rs. Wyślij mi pliki w wiadomościach na czacie.`, threadId);
      }
    } catch (err) {
      console.error('[BACKUP] Error exporting database files:', err);
      const errMsg = err.message || err.error || (typeof err === 'object' ? JSON.stringify(err) : err);
      await safeSend(client.api, `❌ Wystąpił błąd podczas tworzenia kopii: ${errMsg}`, threadId);
    }
  }
};
