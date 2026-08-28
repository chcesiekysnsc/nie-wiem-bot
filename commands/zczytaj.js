const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { DATA_DIR } = require('../utils/storage');

function compressFile(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const gzip = zlib.createGzip();
    const source = fs.createReadStream(inputPath);
    const destination = fs.createWriteStream(outputPath);
    
    source.pipe(gzip).pipe(destination);
    destination.on('finish', resolve);
    destination.on('error', reject);
    source.on('error', reject);
  });
}

module.exports = {
  name: 'zczytaj',
  aliases: ['przeskanuj'],
  async execute(client, message, args) {
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const currentThreadId = message.threadID || message.guild.id;

    await message.reply('📦 **Przygotowuję paczkę wszystkich logów bota...**\nKompresuję pliki do formatu .gz, aby bez problemu przeszły przez limit wielkości Facebooka.');

    const filesToSend = [
      {
        name: 'logs_before_restore.json.gz',
        original: path.join(DATA_DIR, 'logs.json.before_restore.bak')
      },
      {
        name: 'logs_current.json.gz',
        original: path.join(DATA_DIR, 'logs.json')
      },
      {
        name: 'zczytaj_odtworzone.json.gz',
        original: path.join(DATA_DIR, 'zczytaj_odtworzone.json')
      }
    ];

    const tempFiles = [];

    try {
      for (const file of filesToSend) {
        if (fs.existsSync(file.original)) {
          const tempPath = path.join(DATA_DIR, `temp_${Date.now()}_${file.name}`);
          console.log(`Kompresuję ${file.original} -> ${tempPath}`);
          await compressFile(file.original, tempPath);
          tempFiles.push({ path: tempPath, name: file.name });
        }
      }

      if (tempFiles.length === 0) {
        await message.reply('❌ Nie znaleziono żadnych plików logów do wysłania.');
        return;
      }

      await message.reply(`📤 **Wysyłam ${tempFiles.length} skompresowanych plików logów...**`);

      for (const tempFile of tempFiles) {
        await new Promise((resolve, reject) => {
          client.api.sendMessage({
            body: `📄 Plik: **${tempFile.name}**\n*(Rozpakuj go np. programem 7-Zip, WinRAR lub na komputerze, aby odczytać plik JSON)*`,
            attachment: fs.createReadStream(tempFile.path)
          }, currentThreadId, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      await message.reply('✅ **Wszystkie pliki zostały pomyślnie wysłane!**');

    } catch (err) {
      console.error('[ZCZYTAJ] Błąd podczas wysyłania logów:', err);
      await message.reply(`❌ Wystąpił błąd podczas wysyłania logów: ${err.message}`);
    } finally {
      // Usuwanie plików tymczasowych
      for (const tempFile of tempFiles) {
        try {
          fs.unlinkSync(tempFile.path);
        } catch (_) {}
      }
    }
  }
};
