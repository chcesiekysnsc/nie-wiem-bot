const fs = require('fs');
const path = require('path');
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
    }, 60000);

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

    const threadId = message.threadID || message.guild.id;
    
    // Domyślny cutoff: 27.08.2026 21:30 w strefie czasowej Polski (1787859000000)
    let cutoffTimestamp = 1787859000000;
    if (args[0]) {
      const parsed = Date.parse(args.join(' '));
      if (!isNaN(parsed)) {
        cutoffTimestamp = parsed;
      } else if (!isNaN(Number(args[0]))) {
        cutoffTimestamp = Number(args[0]);
      }
    }

    const cutoffDateStr = new Date(cutoffTimestamp).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
    await message.reply(`🔍 **Rozpoczynam zczytywanie historii grupy...**\n• Cel: Ostatnie 8k wiadomości przed **${cutoffDateStr}**\n• Wyszukiwane: !bal, !eq, !gang, !top\n• Proszę czekać...`);

    const COMMANDS = ['!bal', '!eq', '!equip', '!gang', '!top'];
    const MAX_MESSAGES = 8000;
    const BATCH_SIZE = 200;
    const DELAY_MS = 1000;

    const allMessages = [];
    let scannedCount = 0;
    let oldestTimestamp = cutoffTimestamp;
    let pageIndex = 0;
    let keepFetching = true;
    let stuckPageCount = 0;

    const botId = typeof client.api.getCurrentUserID === 'function' ? String(client.api.getCurrentUserID()) : '61560227271099';

    try {
      while (keepFetching && scannedCount < MAX_MESSAGES) {
        const amount = Math.min(BATCH_SIZE, MAX_MESSAGES - scannedCount);
        console.log(`[ZCZYTAJ] Pobieranie: strona=${pageIndex + 1}, batch=${amount}, oldestTimestamp=${oldestTimestamp}`);

        const history = await getThreadHistoryPage(client.api, threadId, amount, oldestTimestamp);
        if (history === null || history.length === 0) {
          console.log(`[ZCZYTAJ] Brak kolejnych wiadomości.`);
          break;
        }

        scannedCount += history.length;
        pageIndex++;

        let pageOldest = Infinity;
        for (const msg of history) {
          const ts = Number(msg.timestamp);
          if (ts < pageOldest) pageOldest = ts;

          if (ts <= cutoffTimestamp) {
            allMessages.push({
              ts,
              senderID: msg.senderID ? String(msg.senderID) : null,
              body: (msg.body || '').trim(),
              messageID: msg.messageID ? String(msg.messageID) : null
            });
          }
        }

        if (pageOldest !== Infinity && oldestTimestamp !== null && pageOldest === oldestTimestamp) {
          stuckPageCount++;
          if (stuckPageCount >= 3) {
            console.warn(`[ZCZYTAJ] Zapętlenie paginacji.`);
            break;
          }
        } else {
          stuckPageCount = 0;
        }

        oldestTimestamp = pageOldest !== Infinity && !isNaN(pageOldest) ? pageOldest - 1 : null;
        if (!oldestTimestamp) break;

        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }

      console.log(`[ZCZYTAJ] Zakończono pobieranie. Pobrano ${scannedCount} wiadomości.`);

      // Sortowanie chronologiczne rosnąco
      allMessages.sort((a, b) => a.ts - b.ts);

      const matchedCommands = [];
      for (let i = 0; i < allMessages.length; i++) {
        const msg = allMessages[i];
        if (!msg.body || !msg.senderID || msg.senderID === botId) continue;

        const lower = msg.body.toLowerCase();
        const firstWord = lower.split(/\s+/)[0];

        if (COMMANDS.includes(firstWord)) {
          let responseText = null;
          for (let j = i + 1; j < allMessages.length; j++) {
            const nextMsg = allMessages[j];
            if (nextMsg.ts > msg.ts + 15000) break;
            if (nextMsg.senderID === botId) {
              responseText = nextMsg.body;
              break;
            }
          }

          matchedCommands.push({
            ts: msg.ts,
            date: new Date(msg.ts).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }),
            userId: msg.senderID,
            command: firstWord,
            body: msg.body,
            response: responseText
          });
        }
      }

      const latestBal = new Map();
      const latestEq = new Map();
      const latestGang = new Map();
      const latestTop = new Map();

      for (const entry of matchedCommands) {
        if (!entry.response) continue;

        if (entry.command === '!bal') {
          latestBal.set(entry.userId, entry);
        } else if (['!eq', '!equip'].includes(entry.command)) {
          latestEq.set(entry.userId, entry);
        } else if (entry.command === '!gang') {
          latestGang.set(entry.userId, entry);
        } else if (entry.command === '!top') {
          latestTop.set(entry.userId, entry);
        }
      }

      const outputData = {
        meta: {
          scannedMessagesTotal: scannedCount,
          matchedCommandsCount: matchedCommands.length,
          cutoffTime: cutoffDateStr,
          cutoffTimestamp
        },
        bal: Array.from(latestBal.values()),
        eq: Array.from(latestEq.values()),
        gang: Array.from(latestGang.values()),
        top: Array.from(latestTop.values())
      };

      const fileName = `zczytaj_stan_${Date.now()}.json`;
      const filePath = path.join(DATA_DIR, fileName);
      fs.writeFileSync(filePath, JSON.stringify(outputData, null, 2), 'utf8');

      await new Promise((resolve, reject) => {
        client.api.sendMessage({
          body: `📦 **Zczytywanie zakończone!**\n` +
                `• Zakres: do ${cutoffDateStr}\n` +
                `• Przeskanowano: ${scannedCount} wiadomości\n\n` +
                `Unikalne stany końcowe przed resetem:\n` +
                `💰 Portfele (!bal): ${latestBal.size}\n` +
                `🎒 Ekwipunki (!eq): ${latestEq.size}\n` +
                `👥 Gangi (!gang): ${latestGang.size}\n` +
                `🏆 Topki (!top): ${latestTop.size}\n\n` +
                `Wysyłam wygenerowany plik JSON...`,
          attachment: fs.createReadStream(filePath)
        }, threadId, (err) => {
          try { fs.unlinkSync(filePath); } catch {}
          if (err) reject(err);
          else resolve();
        });
      });

    } catch (err) {
      console.error('[ZCZYTAJ] Błąd:', err);
      await message.reply(`❌ Błąd podczas wykonywania zczytywania: ${err.message}`);
    }
  }
};
