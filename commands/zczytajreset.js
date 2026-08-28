const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../utils/storage');

const PROGRESS_FILE = path.join(DATA_DIR, 'zczytaj_progress.json');

module.exports = {
  name: 'zczytajreset',
  aliases: ['zreset'],
  async execute(client, message, args) {
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    try {
      if (fs.existsSync(PROGRESS_FILE)) {
        fs.unlinkSync(PROGRESS_FILE);
        await message.reply('🗑️ **Postęp zczytywania został wyczyszczony!**\nNastępne **!zczytaj** zacznie skanowanie od zera.');
      } else {
        await message.reply('ℹ️ Brak zapisanego postępu — nic do wyczyszczenia.');
      }
    } catch (err) {
      await message.reply(`❌ Błąd podczas czyszczenia postępu: ${err.message}`);
    }
  }
};
