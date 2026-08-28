const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../utils/storage');

const ODTWORZONE_FILE = path.join(DATA_DIR, 'zczytaj_odtworzone.json');

module.exports = {
  name: 'zczytajmax',
  aliases: ['zmax'],
  async execute(client, message, args) {
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const currentThreadId = message.threadID || message.guild.id;

    if (!fs.existsSync(ODTWORZONE_FILE)) {
      await message.reply('❌ Brak pliku z odtworzonymi danymi (zczytaj_odtworzone.json). Najpierw uruchom proces odzyskiwania.');
      return;
    }

    let restoredData;
    try {
      restoredData = JSON.parse(fs.readFileSync(ODTWORZONE_FILE, 'utf8'));
    } catch (err) {
      await message.reply('❌ Błąd odczytu pliku odtworzonych danych.');
      return;
    }

    const balCount = restoredData.bal ? restoredData.bal.length : 0;
    const eqCount = restoredData.eq ? restoredData.eq.length : 0;
    const gangCount = restoredData.gang ? restoredData.gang.length : 0;
    const topCount = restoredData.top ? restoredData.top.length : 0;
    const dailyCount = restoredData.daily ? restoredData.daily.length : 0;
    const profileCount = restoredData.profiles ? restoredData.profiles.length : 0;

    const dateRange = restoredData.meta && restoredData.meta.dateRange ? restoredData.meta.dateRange : 'nieokreślony';

    const fileName = `zczytaj_odtworzone_${Date.now()}.json`;
    const tempFilePath = path.join(DATA_DIR, fileName);
    fs.writeFileSync(tempFilePath, JSON.stringify(restoredData, null, 2), 'utf8');

    try {
      await new Promise((resolve, reject) => {
        client.api.sendMessage({
          body: `📦 **Pełny eksport ODZYSKANYCH danych bota!**\n` +
                `• Stan na: 27.08.2026 19:55 (najbliższe dostępne logi)\n` +
                `• Zakres logów: ${dateRange}\n\n` +
                `Odzyskane unikalne staty:\n` +
                `💰 Portfele (!bal): ${balCount}\n` +
                `🎒 Ekwipunki (!eq): ${eqCount}\n` +
                `📆 Nagrody (!daily): ${dailyCount}\n` +
                `👥 Gangi (!gang): ${gangCount}\n` +
                `🏆 Topki (!top): ${topCount}\n` +
                `👤 Profile ogółem: ${profileCount}\n\n` +
                `Wysyłam plik z kompletem danych do wgrania...`,
          attachment: fs.createReadStream(tempFilePath)
        }, currentThreadId, (err) => {
          try { fs.unlinkSync(tempFilePath); } catch {}
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (err) {
      await message.reply(`❌ Błąd wysyłania pliku: ${err.message}`);
      try { fs.unlinkSync(tempFilePath); } catch {}
    }
  }
};
