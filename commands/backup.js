const fs = require('fs');
const path = require('path');

// Safe send helper to prevent hanging if Facebook API doesn't trigger the callback
function safeSend(api, content, threadID) {
  return new Promise((resolve) => {
    let completed = false;
    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.warn('[BACKUP] safeSend timed out for content length:', content.length);
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

    await message.reply('📦 Rozpoczynam eksport bazy danych w formacie tekstowym...');

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

      for (const file of files) {
        const filePath = path.join(dataDir, file);
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          continue;
        }

        console.log(`[BACKUP] Processing file as text: ${file} (${stats.size} bytes)...`);
        const content = fs.readFileSync(filePath, 'utf8');

        // Safe maximum characters per message for Messenger code blocks
        const maxChunkSize = 7000;

        if (content.length <= maxChunkSize) {
          const formattedMsg = `📄 Plik: **${file}**\n\`\`\`json\n${content}\n\`\`\``;
          await safeSend(client.api, formattedMsg, threadId);
        } else {
          const chunks = [];
          for (let i = 0; i < content.length; i += maxChunkSize) {
            chunks.push(content.substring(i, i + maxChunkSize));
          }

          await safeSend(client.api, `📄 Plik **${file}** jest za duży i zostanie wysłany w ${chunks.length} częściach tekstowych:`, threadId);
          for (let idx = 0; idx < chunks.length; idx++) {
            const chunkMsg = `🧩 Część ${idx + 1}/${chunks.length} dla \`${file}\`:\n\`\`\`json\n${chunks[idx]}\n\`\`\``;
            await safeSend(client.api, chunkMsg, threadId);
            // Small sleep to avoid trigger rate limiting
            await new Promise(r => setTimeout(r, 1200));
          }
        }
      }

      await safeSend(client.api, '✅ Kopiowanie zakończone! Skopiuj powyższe bloki tekstu JSON i zapisz je w odpowiednich plikach na nowym hostingu w folderze `data/`.', threadId);
    } catch (err) {
      console.error('[BACKUP] Error exporting database files:', err);
      const errMsg = err.message || err.error || (typeof err === 'object' ? JSON.stringify(err) : err);
      await safeSend(client.api, `❌ Wystąpił błąd podczas tworzenia kopii: ${errMsg}`, threadId);
    }
  }
};
