const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../utils/storage');

const PROGRESS_FILE = path.join(DATA_DIR, 'zczytaj_progress.json');

module.exports = {
  name: 'zczytajmax',
  aliases: ['zmax'],
  async execute(client, message, args) {
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const currentThreadId = message.threadID || message.guild.id;

    if (!fs.existsSync(PROGRESS_FILE)) {
      await message.reply('❌ Brak zapisanego postępu. Najpierw uruchom **!zczytaj** aby przeskanować grupy.');
      return;
    }

    let progress;
    try {
      progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    } catch (err) {
      await message.reply('❌ Błąd odczytu pliku postępu.');
      return;
    }

    const balEntries = Object.values(progress.stats.bal || {});
    const eqEntries = Object.values(progress.stats.eq || {});
    const gangEntries = Object.values(progress.stats.gang || {});
    const topEntries = Object.values(progress.stats.top || {});
    const dailyEntries = Object.values(progress.stats.daily || {});

    const totalEntries = balEntries.length + eqEntries.length + gangEntries.length + topEntries.length + dailyEntries.length;

    if (totalEntries === 0) {
      await message.reply('⚠️ Brak zebranych statów. Uruchom **!zczytaj** aby przeskanować grupy.');
      return;
    }

    const cutoffDateStr = new Date(progress.cutoffTimestamp).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });

    const outputData = {
      meta: {
        cutoffTime: cutoffDateStr,
        cutoffTimestamp: progress.cutoffTimestamp,
        totalRuns: progress.runs,
        totalGroupsScanned: progress.totalGroupsScanned,
        totalMessagesScanned: progress.totalMessagesScanned,
        lastRunAt: progress.lastRunAt,
        exportedAt: new Date().toISOString()
      },
      bal: balEntries,
      eq: eqEntries,
      gang: gangEntries,
      top: topEntries,
      daily: dailyEntries
    };

    const fileName = `zczytaj_full_${Date.now()}.json`;
    const filePath = path.join(DATA_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(outputData, null, 2), 'utf8');

    try {
      await new Promise((resolve, reject) => {
        client.api.sendMessage({
          body: `📦 **Pełny eksport zczytanych statów!**\n` +
                `• Cutoff: ${cutoffDateStr}\n` +
                `• Biegi skanowania: ${progress.runs}\n` +
                `• Zeskanowane grupy: ${progress.totalGroupsScanned}\n` +
                `• Przeskanowane wiadomości: ${progress.totalMessagesScanned.toLocaleString('pl-PL')}\n\n` +
                `Zebrane unikalne staty:\n` +
                `💰 Portfele (!bal): ${balEntries.length}\n` +
                `🎒 Ekwipunki (!eq): ${eqEntries.length}\n` +
                `📆 Nagrody (!daily): ${dailyEntries.length}\n` +
                `👥 Gangi (!gang): ${gangEntries.length}\n` +
                `🏆 Topki (!top): ${topEntries.length}\n\n` +
                `Wysyłam pełny plik JSON ze wszystkich biegów...`,
          attachment: fs.createReadStream(filePath)
        }, currentThreadId, (err) => {
          try { fs.unlinkSync(filePath); } catch {}
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (err) {
      await message.reply(`❌ Błąd wysyłania pliku: ${err.message}`);
      try { fs.unlinkSync(filePath); } catch {}
    }
  }
};
