const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../utils/storage');

module.exports = {
  name: 'zestaw',
  aliases: ['zczytaj'],
  async execute(client, message, args) {
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const days = Math.min(30, Math.max(1, Number(args[0]) || 4));
    const targetThreadId = '24956371943963938';

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const logsPath = path.join(DATA_DIR, 'logs.json');

    if (!fs.existsSync(logsPath)) {
      await message.reply('❌ Brak pliku logów.');
      return;
    }

    let logs;
    try {
      logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
    } catch (err) {
      await message.reply('❌ Błąd odczytu logów.');
      return;
    }

    const entries = Object.values(logs).filter(entry => {
      if (!entry || !entry.timestamp) return false;
      if (entry.timestamp < cutoff) return false;
      const body = (entry.body || '').toLowerCase();
      const cmd = body.startsWith('!bal') || body.startsWith('!eq') || body.startsWith('!pfp') || body.startsWith('!equip');
      const gang = body.startsWith('!gang');
      return cmd || gang;
    });

    if (entries.length === 0) {
      await message.reply(`⚠️ Brak wpisów z !bal, !eq, !pfp, !gang z ostatnich ${days} dni.`);
      return;
    }

    const output = {
      generatedAt: new Date().toISOString(),
      rangeDays: days,
      cutoff,
      totalEntries: entries.length,
      entries: entries.map(e => {
        const body = (e.body || '').toLowerCase();
        const firstWord = body.split(/\s+/)[0];
        let type = 'other';
        if (['!bal', '!eq', '!pfp', '!equip'].includes(firstWord)) type = 'user_stats';
        else if (body.startsWith('!gang')) type = 'gang';

        return {
          timestamp: e.timestamp,
          type,
          userId: e.userId || null,
          userName: e.userName || null,
          command: firstWord,
          body: e.body,
          threadId: e.threadId || null,
          replyTo: e.replyTo || null
        };
      })
    };

    const fileName = `zestaw_${Date.now()}.json`;
    const filePath = path.join(DATA_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf8');

    try {
      const userStats = output.entries.filter(e => e.type === 'user_stats').length;
      const gangEntries = output.entries.filter(e => e.type === 'gang').length;
      await message.reply(`📦 Znaleziono ${entries.length} wpisów z ostatnich ${days} dni: ${userStats} statystyk użytkowników, ${gangEntries} wpisów o gangach. Wysyłam plik...`);
      await new Promise((resolve, reject) => {
        client.api.sendMessage({
          body: `📦 Zestaw ${entries.length} wpisów z ostatnich ${days} dni.`,
          attachment: fs.createReadStream(filePath)
        }, targetThreadId, (err) => {
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
