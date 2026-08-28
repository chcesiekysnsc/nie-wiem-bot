const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { DATA_DIR } = require('../utils/storage');

const PROGRESS_FILE = path.join(DATA_DIR, 'zczytajapi_progress.json');
const RAW_FILE = path.join(DATA_DIR, 'zczytajapi_raw.json');

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[ZCZYTAJAPI] Błąd wczytywania progress:', err);
  }
  return {
    scannedThreadIds: [],
    scanFromTimestamp: 1786262400000,
    scanToTimestamp: 1787859000000,
    stats: { bal: {}, eq: {}, gang: {}, top: {}, daily: {}, topdaily: {}, pfp: {} },
    totalMessagesScanned: 0,
    totalGroupsScanned: 0,
    totalCommandsFound: 0,
    runs: 0,
    lastRunAt: null
  };
}

function saveProgress(progress) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
  } catch (err) {
    console.error('[ZCZYTAJAPI] Błąd zapisu progress:', err);
  }
}

function loadRawEntries() {
  try {
    if (fs.existsSync(RAW_FILE)) {
      return JSON.parse(fs.readFileSync(RAW_FILE, 'utf8'));
    }
  } catch {}
  return [];
}

function saveRawEntries(entries) {
  fs.writeFileSync(RAW_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

function getThreadHistoryPage(api, threadID, amount, timestamp) {
  return new Promise((resolve) => {
    let completed = false;
    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        resolve(null);
      }
    }, 60000);

    api.getThreadHistory(threadID, amount, timestamp, (err, history) => {
      clearTimeout(timeout);
      if (completed) return;
      completed = true;
      if (err) {
        console.error('[ZCZYTAJAPI] getThreadHistory error:', err);
        return resolve(null);
      }
      resolve(history || []);
    });
  });
}

function getThreadListPromise(api, limit) {
  return new Promise((resolve) => {
    api.getThreadList(limit, null, [], (err, list) => {
      if (err) return resolve([]);
      resolve(list || []);
    });
  });
}

function safeDelay(baseMs) {
  const jitter = Math.random() * baseMs * 0.5;
  return new Promise(resolve => setTimeout(resolve, baseMs + jitter));
}

// Upload pliku do file.io (darmowy hosting, link ważny 14 dni)
function uploadToFileIo(filePath) {
  return new Promise((resolve, reject) => {
    const fileData = fs.readFileSync(filePath);
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const fileName = path.basename(filePath);

    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
        `Content-Type: application/json\r\n\r\n`
      ),
      fileData,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const options = {
      hostname: 'file.io',
      path: '/?expires=14d',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success && json.link) {
            resolve(json.link);
          } else {
            reject(new Error('Upload failed: ' + data));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  name: 'zczytajapi',
  aliases: ['zapi'],
  async execute(client, message, args) {
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const currentThreadId = message.threadID || message.guild.id;
    const progress = loadProgress();

    // --- Podkomendy ---
    if (args[0] === 'reset') {
      try { fs.unlinkSync(PROGRESS_FILE); } catch {}
      try { fs.unlinkSync(RAW_FILE); } catch {}
      await message.reply('🗑️ Postęp zczytajapi zresetowany.');
      return;
    }

    if (args[0] === 'status') {
      const counts = {};
      for (const [key, val] of Object.entries(progress.stats)) {
        counts[key] = Object.keys(val).length;
      }
      const rawCount = loadRawEntries().length;
      await message.reply(
        `📊 **Status zczytajapi:**\n` +
        `• Biegi: ${progress.runs}\n` +
        `• Grupy zeskanowane: ${progress.totalGroupsScanned}\n` +
        `• Wiadomości: ${progress.totalMessagesScanned.toLocaleString('pl-PL')}\n` +
        `• Komendy+odpowiedzi (surowe): ${rawCount}\n` +
        `• Komendy sparsowane: ${progress.totalCommandsFound}\n\n` +
        `Zebrane staty:\n` +
        `💰 bal: ${counts.bal} | 🎒 eq: ${counts.eq} | 📆 daily: ${counts.daily}\n` +
        `📅 topdaily: ${counts.topdaily} | 🏆 top: ${counts.top}\n` +
        `👤 pfp: ${counts.pfp} | 👥 gang: ${counts.gang}`
      );
      return;
    }

    if (args[0] === 'eksport' || args[0] === 'export') {
      await message.reply('📦 **Przygotowuję eksport...**');

      // --- PLIK 1: Surowe (raw) dane ---
      const rawEntries = loadRawEntries();
      if (rawEntries.length === 0) {
        await message.reply('❌ Brak surowych danych. Najpierw uruchom !zczytajapi.');
        return;
      }

      const rawExportPath = path.join(DATA_DIR, `zczytajapi_raw_export_${Date.now()}.json`);
      fs.writeFileSync(rawExportPath, JSON.stringify(rawEntries, null, 2), 'utf8');

      // Wyślij surowy plik jako załącznik
      try {
        await new Promise((resolve, reject) => {
          client.api.sendMessage({
            body: `📄 **PLIK 1: Surowe dane (${rawEntries.length} wpisów)**\n` +
                  `Czysty, nieedytowany zapis wszystkich komend i odpowiedzi bota.\n` +
                  `Rozmiar: ${(fs.statSync(rawExportPath).size / 1024).toFixed(1)} KB`,
            attachment: fs.createReadStream(rawExportPath)
          }, currentThreadId, (err) => {
            if (err) reject(err); else resolve();
          });
        });
      } catch (err) {
        await message.reply(`⚠️ Nie udało się wysłać pliku surowego: ${err.message}`);
      }

      // Spróbuj też wrzucić na file.io i dać link
      try {
        const link = await uploadToFileIo(rawExportPath);
        await message.reply(`🔗 **Link do pobrania surowych danych (ważny 14 dni):**\n${link}`);
      } catch (err) {
        console.error('[ZCZYTAJAPI] Upload file.io failed:', err.message);
        await message.reply(`⚠️ Nie udało się wrzucić na serwer (${err.message}). Plik został wysłany jako załącznik powyżej.`);
      }

      // --- PLIK 2: Sparsowane staty ---
      const processedData = {
        meta: {
          description: 'Sparsowane staty z API (zczytajapi)',
          scanFrom: new Date(progress.scanFromTimestamp).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }),
          scanTo: new Date(progress.scanToTimestamp).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }),
          totalRuns: progress.runs,
          totalGroupsScanned: progress.totalGroupsScanned,
          totalCommandsFound: progress.totalCommandsFound,
          exportedAt: new Date().toISOString()
        },
        bal: Object.values(progress.stats.bal),
        eq: Object.values(progress.stats.eq),
        daily: Object.values(progress.stats.daily),
        topdaily: Object.values(progress.stats.topdaily),
        top: Object.values(progress.stats.top),
        pfp: Object.values(progress.stats.pfp),
        gang: Object.values(progress.stats.gang)
      };

      const processedPath = path.join(DATA_DIR, `zczytajapi_parsed_${Date.now()}.json`);
      fs.writeFileSync(processedPath, JSON.stringify(processedData, null, 2), 'utf8');

      try {
        await new Promise((resolve, reject) => {
          client.api.sendMessage({
            body: `📄 **PLIK 2: Sparsowane staty**\n` +
                  `💰 bal: ${processedData.bal.length} | 🎒 eq: ${processedData.eq.length}\n` +
                  `📆 daily: ${processedData.daily.length} | 📅 topdaily: ${processedData.topdaily.length}\n` +
                  `🏆 top: ${processedData.top.length} | 👤 pfp: ${processedData.pfp.length} | 👥 gang: ${processedData.gang.length}`,
            attachment: fs.createReadStream(processedPath)
          }, currentThreadId, (err) => {
            if (err) reject(err); else resolve();
          });
        });
      } catch (err) {
        await message.reply(`⚠️ Nie udało się wysłać pliku: ${err.message}`);
      }

      // Czyszczenie plików tymczasowych
      try { fs.unlinkSync(rawExportPath); } catch {}
      try { fs.unlinkSync(processedPath); } catch {}
      return;
    }

    // === GŁÓWNE SKANOWANIE ===

    const scanFrom = progress.scanFromTimestamp;
    const scanTo = progress.scanToTimestamp;
    const scanFromStr = new Date(scanFrom).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
    const scanToStr = new Date(scanTo).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });

    // Wczytanie listy wątków
    let threads = Array.from(client.activeThreadIds || []);
    try {
      const activeThreadsPath = path.join(DATA_DIR, 'active_threads.json');
      if (fs.existsSync(activeThreadsPath)) {
        const fileThreads = JSON.parse(fs.readFileSync(activeThreadsPath, 'utf8')) || [];
        threads = [...threads, ...fileThreads];
      }
    } catch {}

    try {
      const apiThreads = await getThreadListPromise(client.api, 200);
      const apiGroupIds = apiThreads.filter(t => t.isGroup).map(t => String(t.threadID));
      threads = [...threads, ...apiGroupIds];
    } catch {}

    threads = Array.from(new Set(threads));

    const botId = typeof client.api.getCurrentUserID === 'function'
      ? String(client.api.getCurrentUserID())
      : '61560227271099';

    const filteredThreads = threads.filter(tid => {
      const s = String(tid);
      if (s === botId || s === message.author.id) return false;
      if (s.startsWith('1000') || s.startsWith('6155') || s.startsWith('6156') || s.startsWith('6157')) return false;
      return true;
    });

    const alreadyScanned = new Set(progress.scannedThreadIds || []);
    const remainingThreads = filteredThreads.filter(tid => !alreadyScanned.has(String(tid)));

    if (remainingThreads.length === 0) {
      await message.reply(
        `✅ **Wszystkie ${alreadyScanned.size} grup przeskanowane!**\n` +
        `Komendy: ${progress.totalCommandsFound}\n` +
        `Wpisz **!zczytajapi eksport** aby pobrać dane.\n` +
        `Wpisz **!zczytajapi reset** aby zacząć od nowa.`
      );
      return;
    }

    // === LIMITY BEZPIECZEŃSTWA ===
    const PAGE_SIZE = 50;
    const MAX_PAGES_PER_GROUP = 160;       // 160 * 50 = 8000 wiad./grupę
    const PAGE_DELAY_MS = 3000;            // 3-5s między stronami
    const GROUP_DELAY_MS = 5000;           // 5-8s między grupami
    const MAX_GROUPS_PER_RUN = 5;          // 5 grup na bieg
    const MAX_CONSECUTIVE_ERRORS = 2;

    let groupsThisRun = 0;
    let commandsThisRun = 0;
    let consecutiveErrors = 0;

    // Wczytaj istniejące surowe wpisy
    const rawEntries = loadRawEntries();

    await message.reply(
      `🔍 **Bieg #${progress.runs + 1}** — skan API\n` +
      `📅 Okres: ${scanFromStr} → ${scanToStr}\n` +
      `⚡ Zbiera: WSZYSTKIE komendy (np. !eq @ktoś, !bal @ktoś) + odpowiedzi bota\n` +
      `🛡️ Limity: ${PAGE_SIZE}/stronę, max ${MAX_PAGES_PER_GROUP} stron/grupę (8k wiad.), ${MAX_GROUPS_PER_RUN} grup/bieg\n` +
      `📦 Grupy do przeskanowania: ${Math.min(remainingThreads.length, MAX_GROUPS_PER_RUN)} z ${remainingThreads.length}`
    );

    try {
      for (const threadId of remainingThreads) {
        if (groupsThisRun >= MAX_GROUPS_PER_RUN) break;

        groupsThisRun++;
        console.log(`[ZCZYTAJAPI] [${groupsThisRun}/${Math.min(remainingThreads.length, MAX_GROUPS_PER_RUN)}] Skanuję grupę ${threadId}...`);

        let oldestTimestamp = scanTo;
        let pagesScanned = 0;
        let groupMsgsScanned = 0;
        const groupMessages = [];

        while (pagesScanned < MAX_PAGES_PER_GROUP) {
          await safeDelay(PAGE_DELAY_MS);

          const history = await getThreadHistoryPage(client.api, threadId, PAGE_SIZE, oldestTimestamp);

          if (history === null) {
            consecutiveErrors++;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              await message.reply('⚠️ **Błędy API — przerywam.** Postęp zapisany.');
              saveProgress(progress);
              saveRawEntries(rawEntries);
              return;
            }
            await safeDelay(10000);
            continue;
          }

          consecutiveErrors = 0;
          pagesScanned++;
          groupMsgsScanned += history.length;

          if (history.length === 0) break;

          let pageOldest = Infinity;
          for (const msg of history) {
            const ts = Number(msg.timestamp);
            if (ts < pageOldest) pageOldest = ts;
            if (ts > scanTo || ts < scanFrom) continue;

            const body = (msg.body || '').trim();
            const senderID = msg.senderID ? String(msg.senderID) : null;
            if (!body || !senderID) continue;

            // Zbieraj WSZYSTKIE komendy (dowolne !komenda, także z argumentami)
            const isCommand = body.startsWith('!') && body.length > 1 && !body.startsWith('!!');
            const isBotResponse = senderID === botId;

            if (isCommand || isBotResponse) {
              groupMessages.push({
                ts,
                senderID,
                body,
                messageID: msg.messageID ? String(msg.messageID) : null,
                threadId: String(threadId)
              });
            }
          }

          if (pageOldest < scanFrom) break;
          if (pageOldest >= oldestTimestamp) break;
          oldestTimestamp = pageOldest - 1;

          progress.totalMessagesScanned += history.length;

          // Co 20 stron — info o postępie
          if (pagesScanned % 20 === 0) {
            console.log(`[ZCZYTAJAPI] Grupa ${threadId}: ${pagesScanned} stron, ${groupMsgsScanned} wiad., ${groupMessages.length} komend/odpowiedzi`);
          }
        }

        // Sortuj chronologicznie
        groupMessages.sort((a, b) => a.ts - b.ts);

        // Dodaj WSZYSTKIE surowe wpisy (komendy + odpowiedzi bota)
        for (const msg of groupMessages) {
          rawEntries.push({
            ts: msg.ts,
            date: new Date(msg.ts).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }),
            senderID: msg.senderID,
            body: msg.body,
            threadId: msg.threadId,
            isBotResponse: msg.senderID === botId
          });
        }

        // Parsowanie: łączenie komend z odpowiedziami
        for (let i = 0; i < groupMessages.length; i++) {
          const msg = groupMessages[i];
          if (!msg.body || !msg.senderID || msg.senderID === botId) continue;
          if (!msg.body.startsWith('!') || msg.body.length <= 1) continue;

          const lower = msg.body.toLowerCase().trim();
          const firstWord = lower.split(/\s+/)[0];

          // Szukaj odpowiedzi bota w ciągu 15 sekund
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

          commandsThisRun++;
          progress.totalCommandsFound++;

          const entry = {
            ts: msg.ts,
            date: new Date(msg.ts).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }),
            userId: msg.senderID,
            command: firstWord,
            body: msg.body,
            response: responseText,
            threadId: msg.threadId
          };

          // Zapisz do odpowiedniej kategorii
          if (firstWord === '!bal') {
            const existing = progress.stats.bal[entry.userId];
            if (!existing || entry.ts > existing.ts) progress.stats.bal[entry.userId] = entry;
          } else if (['!eq', '!equip'].includes(firstWord)) {
            const existing = progress.stats.eq[entry.userId];
            if (!existing || entry.ts > existing.ts) progress.stats.eq[entry.userId] = entry;
          } else if (firstWord === '!gang') {
            const key = entry.threadId;
            const existing = progress.stats.gang[key];
            if (!existing || entry.ts > existing.ts) progress.stats.gang[key] = entry;
          } else if (firstWord === '!top') {
            const key = entry.threadId;
            const existing = progress.stats.top[key];
            if (!existing || entry.ts > existing.ts) progress.stats.top[key] = entry;
          } else if (firstWord === '!topdaily') {
            const key = entry.threadId;
            const existing = progress.stats.topdaily[key];
            if (!existing || entry.ts > existing.ts) progress.stats.topdaily[key] = entry;
          } else if (firstWord === '!daily') {
            const existing = progress.stats.daily[entry.userId];
            if (!existing || entry.ts > existing.ts) progress.stats.daily[entry.userId] = entry;
          } else if (firstWord === '!pfp') {
            const existing = progress.stats.pfp[entry.userId];
            if (!existing || entry.ts > existing.ts) progress.stats.pfp[entry.userId] = entry;
          }
        }

        // Oznacz grupę jako zeskanowaną
        progress.scannedThreadIds.push(String(threadId));
        progress.totalGroupsScanned++;
        saveProgress(progress);
        saveRawEntries(rawEntries);

        await client.api.sendMessage(
          `⏳ Grupa ${groupsThisRun}/${Math.min(remainingThreads.length, MAX_GROUPS_PER_RUN)} ✓ ` +
          `(${groupMsgsScanned} wiad., ${pagesScanned} stron, ${commandsThisRun} komend w biegu)`,
          currentThreadId
        ).catch(() => {});

        if (groupsThisRun < MAX_GROUPS_PER_RUN) {
          await safeDelay(GROUP_DELAY_MS);
        }
      }

      progress.runs++;
      progress.lastRunAt = new Date().toISOString();
      saveProgress(progress);
      saveRawEntries(rawEntries);

      const remainingAfter = filteredThreads.filter(tid => !new Set(progress.scannedThreadIds).has(String(tid))).length;

      let statusMsg =
        `📦 **Bieg #${progress.runs} zakończony!**\n` +
        `• Grupy w tym biegu: ${groupsThisRun}\n` +
        `• Komendy w tym biegu: ${commandsThisRun}\n` +
        `• Surowe wpisy łącznie: ${rawEntries.length}\n` +
        `• Komendy sparsowane łącznie: ${progress.totalCommandsFound}\n`;

      if (remainingAfter > 0) {
        statusMsg += `\n⏳ **Pozostało ${remainingAfter} grup.** Wpisz **!zczytajapi** ponownie.\n`;
      } else {
        statusMsg += `\n✅ **Wszystkie grupy przeskanowane!**\n`;
      }
      statusMsg += `\n📥 Wpisz **!zczytajapi eksport** aby pobrać oba pliki (surowy + sparsowany).`;

      await message.reply(statusMsg);

    } catch (err) {
      console.error('[ZCZYTAJAPI] Fatalny błąd:', err);
      progress.runs++;
      progress.lastRunAt = new Date().toISOString();
      saveProgress(progress);
      saveRawEntries(rawEntries);
      await message.reply(`❌ Błąd: ${err.message}\nPostęp zapisany.`);
    }
  }
};
