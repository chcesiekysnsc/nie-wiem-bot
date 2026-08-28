const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../utils/storage');

const PROGRESS_FILE = path.join(DATA_DIR, 'zczytaj_progress.json');

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[ZCZYTAJ] Błąd wczytywania progress:', err);
  }
  return {
    scannedThreadIds: [],
    cutoffTimestamp: 1787859000000,
    stats: { bal: {}, eq: {}, gang: {}, top: {}, daily: {} },
    totalMessagesScanned: 0,
    totalGroupsScanned: 0,
    runs: 0,
    lastRunAt: null,
    newestLogTimestamp: 0
  };
}

function saveProgress(progress) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
  } catch (err) {
    console.error('[ZCZYTAJ] Błąd zapisu progress:', err);
  }
}

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
  aliases: ['przeskanuj'],
  async execute(client, message, args) {
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const currentThreadId = message.threadID || message.guild.id;

    // Wczytanie wcześniejszego postępu
    const progress = loadProgress();

    // Domyślny cutoff: 27.08.2026 21:30 w strefie czasowej Polski (1787859000000)
    let cutoffTimestamp = progress.cutoffTimestamp || 1787859000000;
    if (args[0]) {
      const parsed = Date.parse(args.join(' '));
      if (!isNaN(parsed)) {
        cutoffTimestamp = parsed;
      } else if (!isNaN(Number(args[0]))) {
        cutoffTimestamp = Number(args[0]);
      }
    }
    progress.cutoffTimestamp = cutoffTimestamp;

    const cutoffDateStr = new Date(cutoffTimestamp).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
    const newestLogTs = progress.newestLogTimestamp || 0;
    const newestLogDateStr = newestLogTs > 0 ? new Date(newestLogTs).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }) : 'brak';

    await message.reply('⏳ **Wczytuję listę wszystkich grup z Facebooka...**');

    // Wczytanie listy wątków (z API + z pamięci + z dysku)
    let threads = Array.from(client.activeThreadIds || []);

    try {
      const activeThreadsPath = path.join(DATA_DIR, 'active_threads.json');
      if (fs.existsSync(activeThreadsPath)) {
        const fileThreads = JSON.parse(fs.readFileSync(activeThreadsPath, 'utf8')) || [];
        threads = [...threads, ...fileThreads];
      }
    } catch (err) {
      console.error('[ZCZYTAJ] Błąd wczytywania active_threads.json:', err);
    }

    try {
      const apiThreads = await getThreadListPromise(client.api, 200);
      const apiGroupIds = apiThreads.filter(t => t.isGroup).map(t => String(t.threadID));
      threads = [...threads, ...apiGroupIds];
    } catch (err) {
      console.error('[ZCZYTAJ] Błąd getThreadListPromise:', err);
    }

    threads = Array.from(new Set(threads));

    const botId = typeof client.api.getCurrentUserID === 'function' ? String(client.api.getCurrentUserID()) : '61560227271099';

    const filteredThreads = threads.filter(tid => {
      const sTid = String(tid);
      if (sTid === botId || sTid === message.author.id) return false;
      if (sTid.startsWith('1000') || sTid.startsWith('6155') || sTid.startsWith('6156') || sTid.startsWith('6157')) {
        return false;
      }
      return true;
    });

    // Odfiltrowanie już zeskanowanych grup
    const alreadyScanned = new Set(progress.scannedThreadIds || []);
    const remainingThreads = filteredThreads.filter(tid => !alreadyScanned.has(String(tid)));

    if (remainingThreads.length === 0) {
      await message.reply(
        `✅ **Wszystkie grupy zostały już zeskanowane!**\n` +
        `• Łącznie zeskanowano: ${alreadyScanned.size} grup, ${progress.totalMessagesScanned.toLocaleString('pl-PL')} wiadomości\n` +
        `• Liczba biegów: ${progress.runs}\n\n` +
        `Użyj **!zczytajmax** aby wyeksportować wszystkie zebrane staty.\n` +
        `Użyj **!zczytajreset** aby zacząć od nowa.`
      );
      return;
    }

    const COMMANDS = ['!bal', '!eq', '!equip', '!gang', '!top', '!daily'];
    const MAX_PER_GROUP = 12000;
    const TOTAL_LIMIT = 20000;
    const BATCH_SIZE = 250;

    await message.reply(
      `🔍 **Rozpoczynam zczytywanie (bieg #${progress.runs + 1})...**\n` +
      `• Pozostałe grupy: ${remainingThreads.length} (z ${filteredThreads.length} ogółem)\n` +
      `• Już wczytano z logów lokalnych: ${Object.keys(progress.stats.bal).length} portfeli\n` +
      `• Przedział skanowania API: od **${newestLogDateStr}** do **${cutoffDateStr}**\n` +
      `• Odstępy: ~1.5s - 2.5s`
    );

    let totalScannedThisRun = 0;
    let groupsScannedThisRun = 0;
    let hitLimit = false;
    let consecutiveErrors = 0;

    client.zczytajState = {
      active: true,
      startedAt: Date.now(),
      totalGroups: remainingThreads.length,
      currentGroupIndex: 0,
      totalMessagesScanned: 0
    };

    try {
      for (const threadId of remainingThreads) {
        if (hitLimit) break;

        groupsScannedThisRun++;
        if (client.zczytajState) {
          client.zczytajState.currentGroupIndex = groupsScannedThisRun;
        }

        let scannedCount = 0;
        let oldestTimestamp = cutoffTimestamp;
        let keepFetching = true;
        let stuckPageCount = 0;
        const groupMessages = [];

        console.log(`[ZCZYTAJ] [${groupsScannedThisRun}/${remainingThreads.length}] Skanuję grupę ${threadId}...`);

        while (keepFetching && scannedCount < MAX_PER_GROUP) {
          const amount = Math.min(BATCH_SIZE, MAX_PER_GROUP - scannedCount);
          const history = await getThreadHistoryPage(client.api, threadId, amount, oldestTimestamp);

          if (history === null) {
            consecutiveErrors++;
            console.warn(`[ZCZYTAJ] Błąd history (błędy: ${consecutiveErrors})`);
            if (consecutiveErrors >= 3) {
              await message.reply('⚠️ **Wykryto błędy API Facebooka.** Przerywam ten bieg. Postęp zapisany.');
              hitLimit = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }

          consecutiveErrors = 0;

          if (history.length === 0) {
            break;
          }

          scannedCount += history.length;
          totalScannedThisRun += history.length;
          if (client.zczytajState) {
            client.zczytajState.totalMessagesScanned = totalScannedThisRun;
          }

          let pageOldest = Infinity;
          for (const msg of history) {
            const ts = Number(msg.timestamp);
            if (ts < pageOldest) pageOldest = ts;

            // Pobieramy tylko te nowsze niż newestLogTs i starsze niż cutoff
            if (ts <= cutoffTimestamp && ts >= newestLogTs) {
              groupMessages.push({
                ts,
                senderID: msg.senderID ? String(msg.senderID) : null,
                body: (msg.body || '').trim(),
                messageID: msg.messageID ? String(msg.messageID) : null,
                threadId: String(threadId)
              });
            }
          }

          if (pageOldest !== Infinity && oldestTimestamp !== null && pageOldest === oldestTimestamp) {
            stuckPageCount++;
            if (stuckPageCount >= 3) break;
          } else {
            stuckPageCount = 0;
          }

          // Optymalizacja: jeśli najstarsza wiadomość na stronie jest starsza niż newestLogTs,
          // oznacza to, że weszliśmy już w okres pokryty przez logi lokalne. Przerywamy dalsze pobieranie z API.
          if (pageOldest < newestLogTs) {
            console.log(`[ZCZYTAJ] Osiągnięto najnowszy timestamp logu lokalnego (${newestLogTs}). Kończę pobieranie z API dla grupy ${threadId}.`);
            keepFetching = false;
          }

          oldestTimestamp = pageOldest !== Infinity && !isNaN(pageOldest) ? pageOldest - 1 : null;
          if (!oldestTimestamp) break;

          if (keepFetching) {
            const pageDelay = 1500 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, pageDelay));
          }
        }

        if (hitLimit) break;

        // Przetwarzanie wiadomości z tej grupy
        groupMessages.sort((a, b) => a.ts - b.ts);

        for (let i = 0; i < groupMessages.length; i++) {
          const msg = groupMessages[i];
          if (!msg.body || !msg.senderID || msg.senderID === botId) continue;

          const lower = msg.body.toLowerCase();
          const firstWord = lower.split(/\s+/)[0];

          if (COMMANDS.includes(firstWord)) {
            let responseText = null;
            for (let j = i + 1; j < groupMessages.length; j++) {
              const nextMsg = groupMessages[j];
              if (nextMsg.ts > msg.ts + 15000) break;
              if (nextMsg.senderID === botId) {
                responseText = nextMsg.body;
                break;
              }
            }

            if (!responseText) continue;

            const entry = {
              ts: msg.ts,
              date: new Date(msg.ts).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }),
              userId: msg.senderID,
              command: firstWord,
              body: msg.body,
              response: responseText,
              threadId: msg.threadId
            };

            if (firstWord === '!bal') {
              const existing = progress.stats.bal[entry.userId];
              if (!existing || entry.ts > existing.ts) {
                progress.stats.bal[entry.userId] = entry;
              }
            } else if (['!eq', '!equip'].includes(firstWord)) {
              const existing = progress.stats.eq[entry.userId];
              if (!existing || entry.ts > existing.ts) {
                progress.stats.eq[entry.userId] = entry;
              }
            } else if (firstWord === '!gang') {
              const key = entry.threadId;
              const existing = progress.stats.gang[key];
              if (!existing || entry.ts > existing.ts) {
                progress.stats.gang[key] = entry;
              }
            } else if (firstWord === '!top') {
              const key = entry.threadId;
              const existing = progress.stats.top[key];
              if (!existing || entry.ts > existing.ts) {
                progress.stats.top[key] = entry;
              }
            } else if (firstWord === '!daily') {
              const existing = progress.stats.daily[entry.userId];
              if (!existing || entry.ts > existing.ts) {
                progress.stats.daily[entry.userId] = entry;
              }
            }
          }
        }

        progress.scannedThreadIds.push(String(threadId));
        progress.totalGroupsScanned++;
        progress.totalMessagesScanned += scannedCount;

        saveProgress(progress);

        await client.api.sendMessage(
          `⏳ **Postęp zczytywania (bieg #${progress.runs + 1}):**\n` +
          `• Grupa ${groupsScannedThisRun}/${remainingThreads.length} zakończona (pobrano z API: ${scannedCount} wiad.)\n` +
          `• Skumulowane portfele: ${Object.keys(progress.stats.bal).length}`,
          currentThreadId
        ).catch(e => console.error('[ZCZYTAJ] Błąd wysyłania statusu:', e));

        if (totalScannedThisRun >= TOTAL_LIMIT) {
          hitLimit = true;
          console.log(`[ZCZYTAJ] Przekroczono limit ${TOTAL_LIMIT}.`);
        }

        if (!hitLimit) {
          const groupDelay = 3000 + Math.random() * 2000;
          await new Promise(resolve => setTimeout(resolve, groupDelay));
        }
      }

      progress.runs++;
      progress.lastRunAt = new Date().toISOString();
      saveProgress(progress);

      const remainingAfter = filteredThreads.filter(tid => !new Set(progress.scannedThreadIds).has(String(tid))).length;

      const balCount = Object.keys(progress.stats.bal).length;
      const eqCount = Object.keys(progress.stats.eq).length;
      const gangCount = Object.keys(progress.stats.gang).length;
      const topCount = Object.keys(progress.stats.top).length;
      const dailyCount = Object.keys(progress.stats.daily).length;

      let statusMsg =
        `📦 **Bieg #${progress.runs} zakończony pomyślnie!**\n` +
        `• Łącznie dotąd: ${progress.totalGroupsScanned} grup, ${progress.totalMessagesScanned.toLocaleString('pl-PL')} wiadomości z API\n\n` +
        `Aktualnie zebrane staty (logi lokalne + API):\n` +
        `💰 Portfele (!bal): ${balCount}\n` +
        `🎒 Ekwipunki (!eq): ${eqCount}\n` +
        `📆 Nagrody (!daily): ${dailyCount}\n` +
        `👥 Gangi (!gang): ${gangCount}\n` +
        `🏆 Topki (!top): ${topCount}\n`;

      if (remainingAfter > 0) {
        statusMsg += `\n⏳ **Pozostało jeszcze ${remainingAfter} grup.**\nOdczekaj chwilę i wpisz **!zczytaj** ponownie.`;
      } else {
        statusMsg += `\n✅ **Wszystkie grupy zostały w pełni przeskanowane!**\nWpisz **!zczytajmax** aby wyeksportować pełne staty.`;
      }

      await message.reply(statusMsg);

    } catch (err) {
      console.error('[ZCZYTAJ] Fatalny błąd:', err);
      progress.runs++;
      progress.lastRunAt = new Date().toISOString();
      saveProgress(progress);
      await message.reply(`❌ Błąd podczas zczytywania: ${err.message}`);
    } finally {
      client.zczytajState = null;
    }
  }
};
