const fs = require('fs');
const path = require('path');

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

    await message.reply('📦 Przygotowuję kopię zapasową bazy danych (pliki JSON)...');

    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      await message.reply('❌ Folder data/ nie istnieje.');
      return;
    }

    try {
      const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
      if (files.length === 0) {
        await message.reply('❌ Brak plików bazy danych (.json) w folderze data/.');
        return;
      }

      for (const file of files) {
        const filePath = path.join(dataDir, file);
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          continue;
        }

        console.log(`[BACKUP] Sending file: ${file} (${stats.size} bytes)...`);

        let sentAsAttachment = false;
        try {
          // Wrap api.sendMessage in a Promise with a timeout
          await new Promise((resolve, reject) => {
            let completed = false;
            const timeout = setTimeout(() => {
              if (!completed) {
                completed = true;
                reject(new Error('Limit czasu (12s) minął przy wysyłaniu załącznika.'));
              }
            }, 12000);

            client.api.sendMessage({
              body: `📄 Kopia bazy danych (załącznik): **${file}**`,
              attachment: fs.createReadStream(filePath)
            }, message.threadID, (err) => {
              clearTimeout(timeout);
              if (completed) return;
              completed = true;
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });
          sentAsAttachment = true;
        } catch (attachErr) {
          console.warn(`[BACKUP] Failed to send ${file} as attachment, falling back to text chunking:`, attachErr);
          await message.reply(`⚠️ Nie udało się wysłać ${file} jako załącznik (Błąd: ${attachErr.message || attachErr}). Wysyłam zawartość jako tekst...`);
          
          const content = fs.readFileSync(filePath, 'utf8');
          const maxChunkSize = 8000;
          if (content.length <= maxChunkSize) {
            await message.reply(`📄 Zawartość pliku \`${file}\`:\n\`\`\`json\n${content}\n\`\`\``);
          } else {
            const chunks = [];
            for (let i = 0; i < content.length; i += maxChunkSize) {
              chunks.push(content.substring(i, i + maxChunkSize));
            }
            
            await message.reply(`📄 Plik \`${file}\` jest zbyt duży i zostanie wysłany w ${chunks.length} częściach tekstowych:`);
            for (let idx = 0; idx < chunks.length; idx++) {
              await message.reply(`🧩 Część ${idx + 1}/${chunks.length} dla \`${file}\`:\n\`\`\`json\n${chunks[idx]}\n\`\`\``);
              // Small delay between sending chunks to avoid spam protection rate limit
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        }
      }

      await message.reply('✅ Wszystkie pliki bazy danych zostały przesłane. Jeśli były wysyłane jako tekst, skopiuj całą zawartość i zapisz w odpowiednich plikach w folderze `data/` na nowym hostingu.');
    } catch (err) {
      console.error('[BACKUP] Error exporting database files:', err);
      const errMsg = err.message || err.error || (typeof err === 'object' ? JSON.stringify(err) : err);
      await message.reply(`❌ Wystąpił błąd podczas tworzenia kopii: ${errMsg}`);
    }
  }
};
