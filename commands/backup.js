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
        
        // Zabezpieczenie przed wysłaniem pustych plików (jeśli plik nie ma rozmiaru)
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          continue;
        }

        await client.api.sendMessage({
          body: `📄 Kopia bazy danych: **${file}**`,
          attachment: fs.createReadStream(filePath)
        }, message.threadID);
      }

      await message.reply('✅ Wszystkie pliki bazy danych zostały przesłane jako załączniki. Zapisz je na komputerze w folderze `data/` przed uruchomieniem bota na nowym hostingu.');
    } catch (err) {
      console.error('[BACKUP] Error exporting database files:', err);
      await message.reply(`❌ Wystąpił błąd podczas tworzenia kopii: ${err.message}`);
    }
  }
};
