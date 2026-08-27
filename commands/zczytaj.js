const fs = require('fs');
const path = require('path');
const { withData, createUser } = require('../utils/storage');
const { DATA_DIR } = require('../utils/storage');

function getThreadHistoryPage(api, threadID, amount, timestamp) {
  return new Promise((resolve) => {
    let completed = false;
    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.warn(`[ZCZYTAJ] getThreadHistory timed out for thread ${threadID}`);
        resolve(null);
      }
    }, 120000);

    api.getThreadHistory(threadID, amount, timestamp, (err, history) => {
      clearTimeout(timeout);
      if (completed) return;
      completed = true;
      if (err) {
        console.error('[ZCZYTAJ] getThreadHistory error:', err);
        return resolve(null);
      }
      resolve(history || []);
    });
  });
}

module.exports = {
  name: 'zczytaj',
  aliases: ['zestaw', 'przeskanuj'],
  async execute(client, message, args) {
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const days = Math.min(30, Math.max(1, Number(args[0]) || 4));
    const targetThreadId = '24956371943963938';
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const threads = Array.from(client.activeThreadIds || []);
    if (!threads.length) {
      await message.reply('❌ Bot nie jest w żadnych grupach.');
      return;
    }

    await message.reply(`🔍 **Rozpoczynam skanowanie ${threads.length} grup...**\nSzukam !bal, !eq, !pfp, !gang z ostatnich ${days} dni. To może zająć kilka minut.`);

    const matched = [];
    let totalScanned = 0;
    let totalGroups = 0;

    for (const threadId of threads) {
      if (threadId === message.author.id) continue;
      totalGroups++;

      let oldestTimestamp = null;
      let keepFetching = true;
      let fetchError = false;
      let groupScanned = 0;
      const MAX_PER_GROUP = 8000;

      while (keepFetching && groupScanned < MAX_PER_GROUP) {
        const batchSize = Math.min(500, MAX_PER_GROUP - groupScanned);
        const history = await getThreadHistoryPage(client.api, threadId, batchSize, oldestTimestamp);
        if (history === null) {
          fetchError = true;
          break;
        }
        if (history.length === 0) break;

        groupScanned += history.length;
        totalScanned += history.length;
        let pageOldest = Infinity;

        for (const msg of history) {
          const ts = Number(msg.timestamp);
          if (ts < pageOldest) pageOldest = ts;

          if (ts < cutoff) {
            keepFetching = false;
            break;
          }

          const body = (msg.body || '').trim();
          const lower = body.toLowerCase();
          const firstWord = lower.split(/\s+/)[0];
          const isCommand = ['!bal', '!eq', '!pfp', '!gang', '!equip'].includes(firstWord);
          if (!isCommand) continue;

          matched.push({
            timestamp: new Date(ts).toISOString(),
            type: firstWord === '!gang' ? 'gang' : 'user_stats',
            userId: msg.senderID ? String(msg.senderID) : null,
            userName: msg.senderID ? String(msg.senderID) : null,
            command: firstWord,
            body,
            threadId,
            replyTo: msg.replyTo ? String(msg.replyTo) : null
          });
        }

        if (!keepFetching) break;

        if (pageOldest !== Infinity && pageOldest === oldestTimestamp) {
          break;
        }
        oldestTimestamp = pageOldest !== Infinity && !isNaN(pageOldest) ? pageOldest - 1 : null;
        if (!oldestTimestamp) break;

        await new Promise(resolve => setTimeout(resolve, 800));
      }

      if (fetchError) {
        console.warn(`[ZCZYTAJ] Rate limit/error on thread ${threadId}, continuing with next.`);
      }
    }

    if (matched.length === 0) {
      await message.reply(`⚠️ Nie znaleziono wpisów z !bal, !eq, !pfp, !gang w ostatnich ${days} dniach.\nPrzeskanowano ${totalGroups} grup, ${totalScanned} wiadomości.`);
      return;
    }

    const output = {
      generatedAt: new Date().toISOString(),
      rangeDays: days,
      cutoff: new Date(cutoff).toISOString(),
      totalGroups,
      totalScanned,
      totalEntries: matched.length,
      entries: matched
    };

    const fileName = `zczytaj_${Date.now()}.json`;
    const filePath = path.join(DATA_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf8');

    const userStats = matched.filter(e => e.type === 'user_stats').length;
    const gangEntries = matched.filter(e => e.type === 'gang').length;

    try {
      await message.reply(`📦 Znaleziono ${matched.length} wpisów w ${totalGroups} grupach: ${userStats} statystyk użytkowników, ${gangEntries} wpisów o gangach. Wysyłam plik...`);
      await new Promise((resolve, reject) => {
        client.api.sendMessage({
          body: `📦 Zczytano ${matched.length} wpisów z ${totalGroups} grup (${totalScanned} wiadomości).\n${userStats} statystyk użytkowników, ${gangEntries} gangów.`,
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
