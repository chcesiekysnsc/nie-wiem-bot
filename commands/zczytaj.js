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

function getThreadListPromise(api, limit) {
  return new Promise((resolve) => {
    api.getThreadList(limit, null, [], (err, list) => {
      if (err) {
        console.error('[ZCZYTAJ] getThreadList error:', err);
        return resolve([]);
      }
      resolve(list || []);
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

    const currentThreadId = message.threadID || message.guild.id;
    
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

    // Informujemy o wczytywaniu grup
    const loadingMsg = await message.reply('⏳ **Wczytuję listę wszystkich grup z Facebooka...**');

    // Wczytanie listy wątków (z API + z pamięci + z dysku)
    let threads = Array.from(client.activeThreadIds || []);
    
    // 1. Z dysku fallback
    try {
      const activeThreadsPath = path.join(DATA_DIR, 'active_threads.json');
      if (fs.existsSync(activeThreadsPath)) {
        const fileThreads = JSON.parse(fs.readFileSync(activeThreadsPath, 'utf8')) || [];
        threads = [...threads, ...fileThreads];
      }
    } catch (err) {
      console.error('[ZCZYTAJ] Błąd wczytywania active_threads.json:', err);
    }

    // 2. Pobranie z API Facebooka
    try {
      const apiThreads = await getThreadListPromise(client.api, 200);
      const apiGroupIds = apiThreads.filter(t => t.isGroup).map(t => String(t.threadID));
      threads = [...threads, ...apiGroupIds];
    } catch (err) {
      console.error('[ZCZYTAJ] Błąd getThreadListPromise:', err);
    }

    threads = Array.from(new Set(threads));

    const botId = typeof client.api.getCurrentUserID === 'function' ? String(client.api.getCurrentUserID()) : '61560227271099';

    // Filtrowanie wątków - usuwamy PV użytkowników
    const filteredThreads = threads.filter(tid => {
      const sTid = String(tid);
      if (sTid === botId || sTid === message.author.id) return false;
      if (sTid.startsWith('1000') || sTid.startsWith('6155') || sTid.startsWith('6156') || sTid.startsWith('6157')) {
        return false;
      }
      return true;
    });

    if (filteredThreads.length === 0) {
      await message.reply('❌ Nie znaleziono żadnych aktywnych grup bota.');
      return;
    }

    await message.reply(`🔍 **Rozpoczynam zczytywanie historii z wszystkich grup...**\n• Wykryte grupy ogółem: ${filteredThreads.length}\n• Limit na grupę: 8k wiadomości\n• Cutoff: ${cutoffDateStr}\n• Wyszukiwane: !bal, !eq, !gang, !top\n• Proces może zająć dłuższą chwilę...`);

    const COMMANDS = ['!bal', '!eq', '!equip', '!gang', '!top', '!daily'];
    const MAX_MESSAGES = 8000;
    const BATCH_SIZE = 250;
    const DELAY_MS = 250;

    const allMessages = [];
    let groupIndex = 0;

    client.zczytajState = {
      active: true,
      startedAt: Date.now(),
      totalGroups: filteredThreads.length,
      currentGroupIndex: 0,
      totalMessagesScanned: 0
    };

    try {
      for (const threadId of filteredThreads) {
        groupIndex++;
        if (client.zczytajState) {
          client.zczytajState.currentGroupIndex = groupIndex;
        }
        let scannedCount = 0;
        let oldestTimestamp = cutoffTimestamp;
        let pageIndex = 0;
        let keepFetching = true;
        let stuckPageCount = 0;

        console.log(`[ZCZYTAJ] [${groupIndex}/${filteredThreads.length}] Skanuję grupę ${threadId}...`);

        while (keepFetching && scannedCount < MAX_MESSAGES) {
          const amount = Math.min(BATCH_SIZE, MAX_MESSAGES - scannedCount);
          const history = await getThreadHistoryPage(client.api, threadId, amount, oldestTimestamp);
          
          if (history === null || history.length === 0) {
            break;
          }

          scannedCount += history.length;
          if (client.zczytajState) {
            client.zczytajState.totalMessagesScanned += history.length;
          }
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
                messageID: msg.messageID ? String(msg.messageID) : null,
                threadId
              });
            }
          }

          if (pageOldest !== Infinity && oldestTimestamp !== null && pageOldest === oldestTimestamp) {
            stuckPageCount++;
            if (stuckPageCount >= 3) {
              break;
            }
          } else {
            stuckPageCount = 0;
          }

          oldestTimestamp = pageOldest !== Infinity && !isNaN(pageOldest) ? pageOldest - 1 : null;
          if (!oldestTimestamp) break;

          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }

        // Raportowanie postępu co 5 grup
        if (groupIndex % 5 === 0 || groupIndex === filteredThreads.length) {
          await client.api.sendMessage(
            `⏳ **Status skanowania:** Zeskanowano ${groupIndex}/${filteredThreads.length} grup.\n` +
            `• Łączna liczba zebranych wiadomości: ${allMessages.length}`,
            currentThreadId
          ).catch(e => console.error('[ZCZYTAJ] Błąd wysyłania postępu:', e));
        }

        // Krótkie opóźnienie między grupami
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log(`[ZCZYTAJ] Pobieranie zakończone. Łącznie zebrano: ${allMessages.length} wiadomości.`);

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
            if (nextMsg.threadId !== msg.threadId) continue; // tylko ta sama grupa
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
            response: responseText,
            threadId: msg.threadId
          });
        }
      }

      const latestBal = new Map();
      const latestEq = new Map();
      const latestGang = new Map();
      const latestTop = new Map();
      const latestDaily = new Map();

      for (const entry of matchedCommands) {
        if (!entry.response) continue;

        if (entry.command === '!bal') {
          latestBal.set(entry.userId, entry);
        } else if (['!eq', '!equip'].includes(entry.command)) {
          latestEq.set(entry.userId, entry);
        } else if (entry.command === '!gang') {
          latestGang.set(entry.threadId, entry);
        } else if (entry.command === '!top') {
          latestTop.set(entry.threadId, entry);
        } else if (entry.command === '!daily') {
          latestDaily.set(entry.userId, entry);
        }
      }

      const outputData = {
        meta: {
          scannedGroupsCount: filteredThreads.length,
          scannedMessagesTotal: allMessages.length,
          matchedCommandsCount: matchedCommands.length,
          cutoffTime: cutoffDateStr,
          cutoffTimestamp
        },
        bal: Array.from(latestBal.values()),
        eq: Array.from(latestEq.values()),
        gang: Array.from(latestGang.values()),
        top: Array.from(latestTop.values()),
        daily: Array.from(latestDaily.values())
      };

      const fileName = `zczytaj_stan_${Date.now()}.json`;
      const filePath = path.join(DATA_DIR, fileName);
      fs.writeFileSync(filePath, JSON.stringify(outputData, null, 2), 'utf8');

      await new Promise((resolve, reject) => {
        client.api.sendMessage({
          body: `📦 **Wielogrupowe zczytywanie zakończone!**\n` +
                `• Zakres: do ${cutoffDateStr}\n` +
                `• Zeskanowano: ${filteredThreads.length} grup (${allMessages.length} wiadomości)\n\n` +
                `Unikalne stany końcowe przed resetem:\n` +
                `💰 Portfele (!bal): ${latestBal.size}\n` +
                `🎒 Ekwipunki (!eq): ${latestEq.size}\n` +
                `📆 Nagrody (!daily): ${latestDaily.size}\n` +
                `👥 Gangi (!gang): ${latestGang.size}\n` +
                `🏆 Topki (!top): ${latestTop.size}\n\n` +
                `Wysyłam skumulowany plik JSON...`,
          attachment: fs.createReadStream(filePath)
        }, currentThreadId, (err) => {
          try { fs.unlinkSync(filePath); } catch {}
          if (err) reject(err);
          else resolve();
        });
      });

    } catch (err) {
      console.error('[ZCZYTAJ] Błąd:', err);
      await message.reply(`❌ Błąd podczas wykonywania zczytywania: ${err.message}`);
    } finally {
      client.zczytajState = null;
    }
  }
};
