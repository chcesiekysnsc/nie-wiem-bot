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

    await message.reply('📦 Przygotowuję kopię zapasową bazy danych. Pliki zostaną przesłane jako linki do pobrania...');

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

      let completedFiles = 0;
      const results = [];

      for (const file of files) {
        const filePath = path.join(dataDir, file);
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          completedFiles++;
          continue;
        }

        console.log(`[BACKUP] Processing file: ${file} (${stats.size} bytes)...`);
        const content = fs.readFileSync(filePath, 'utf8');

        // Attempt upload to paste.rs
        let url = null;
        try {
          const response = await axios.post('https://paste.rs/', content, {
            headers: { 'Content-Type': 'text/plain' },
            timeout: 9000 // 9s timeout for pastebin API
          });
          if (response.data && String(response.data).startsWith('http')) {
            url = response.data.trim();
          }
        } catch (uploadErr) {
          console.warn(`[BACKUP] Failed to upload ${file} to paste.rs:`, uploadErr.message);
        }

        completedFiles++;
        const percent = Math.round((completedFiles / files.length) * 100);

        if (url) {
          await safeSend(client.api, `⏳ Postęp: **${percent}%** (${completedFiles}/${files.length})\n📄 Plik: **${file}**\n🔗 Pobierz stąd: ${url}`, threadId);
          results.push(`• **${file}**: ${url}`);
        } else {
          // Fallback to text blocks
          await safeSend(client.api, `⏳ Postęp: **${percent}%** (${completedFiles}/${files.length})\n⚠️ Nie udało się wygenerować linku do **${file}**. Wysyłam zawartość tekstowo na czacie:`, threadId);
          
          const maxChunkSize = 7000;
          if (content.length <= maxChunkSize) {
            await safeSend(client.api, `\`\`\`json\n${content}\n\`\`\``, threadId);
          } else {
            const chunks = [];
            for (let i = 0; i < content.length; i += maxChunkSize) {
              chunks.push(content.substring(i, i + maxChunkSize));
            }
            for (let idx = 0; idx < chunks.length; idx++) {
              await safeSend(client.api, `🧩 Część ${idx + 1}/${chunks.length} dla \`${file}\`:\n\`\`\`json\n${chunks[idx]}\n\`\`\``, threadId);
              await new Promise(r => setTimeout(r, 1000));
            }
          }
          results.push(`• **${file}**: (Przesłany jako tekst na czacie)`);
        }

        // Small sleep to avoid rate limiting
        await new Promise(r => setTimeout(r, 1000));
      }

      const summary = `✅ **Kopia zapasowa gotowa!**\nPobierz te pliki na swój komputer i zapisz je pod odpowiednimi nazwami w folderze \`data/\`:\n\n${results.join('\n')}\n\nZapisz je, a następnie przejdź do następnego kroku instrukcji!`;
      await safeSend(client.api, summary, threadId);
    } catch (err) {
      console.error('[BACKUP] Error exporting database files:', err);
      const errMsg = err.message || err.error || (typeof err === 'object' ? JSON.stringify(err) : err);
      await safeSend(client.api, `❌ Wystąpił błąd podczas tworzenia kopii: ${errMsg}`, threadId);
    }
  }
};
