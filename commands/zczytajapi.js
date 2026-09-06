const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { DATA_DIR } = require('../utils/storage');

const PROGRESS_FILE = path.join(DATA_DIR, 'zczytajapi_progress.json');
const RAW_FILE = path.join(DATA_DIR, 'zczytajapi_raw.json');

const STRICT_SCAN_FROM = 1788386400000; // 03.09.2026, 00:00:00
const STRICT_SCAN_TO = 1788723600000;   // 06.09.2026, 21:40:00

function isWithinScanWindow(ts) {
  const n = Number(ts);
  return Number.isFinite(n) && n >= STRICT_SCAN_FROM && n <= STRICT_SCAN_TO;
}

function loadProgress() {
  let p = null;
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      p = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[ZCZYTAJAPI] Błąd wczytywania progress:', err);
  }
  if (!p || p.scanFromTimestamp !== STRICT_SCAN_FROM || p.scanToTimestamp !== STRICT_SCAN_TO) {
    p = {
      scannedThreadIds: [],
      skippedThreads: [],
      scanFromTimestamp: STRICT_SCAN_FROM,
      scanToTimestamp: STRICT_SCAN_TO,
      stats: { bal: {}, eq: {}, gang: {}, top: {}, daily: {}, topdaily: {}, pfp: {} },
      totalMessagesScanned: 0,
      totalGroupsScanned: 0,
      totalCommandsFound: 0,
      runs: 0,
      lastRunAt: null
    };
  }
  return p;
}

function saveProgress(progress) {
  try {
    progress.scanFromTimestamp = STRICT_SCAN_FROM;
    progress.scanToTimestamp = STRICT_SCAN_TO;
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
  } catch (err) {
    console.error('[ZCZYTAJAPI] Błąd zapisu progress:', err);
  }
}

function loadRawEntries() {
  try {
    if (fs.existsSync(RAW_FILE)) {
      const arr = JSON.parse(fs.readFileSync(RAW_FILE, 'utf8'));
      if (Array.isArray(arr)) {
        return arr.filter(e => isWithinScanWindow(e.ts));
      }
    }
  } catch {}
  return [];
}

function saveRawEntries(entries) {
  const filtered = Array.isArray(entries) ? entries.filter(e => isWithinScanWindow(e.ts)) : [];
  fs.writeFileSync(RAW_FILE, JSON.stringify(filtered, null, 2), 'utf8');
}

function getThreadHistoryPage(api, threadID, amount, timestamp) {
  return new Promise((resolve) => {
    let completed = false;
    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.warn(`[ZCZYTAJAPI] getThreadHistory timed out for thread ${threadID}`);
        resolve(null);
      }
    }, 90000);

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
      function parseMoney(str) {
        if (!str) return 0;
        return Number(str.replace(/[\s\xA0\u200B-\u200D\uFEFF]/g, ''));
      }

      function parseProfileResponse(response, userId) {
        const lvl = response.match(/🏆 Poziom:\s*(\d+)/);
        const pres = response.match(/\[Prestiż\s*(\d+)\]/);
        const gm = response.match(/🎮 Gry:\s*([\d\s\xA0]+)/);
        const cm = response.match(/⌨️ Komendy:\s*([\d\s\xA0]+)/);
        const mm = response.match(/💬 Wiadomości:\s*\*?([\d\s\xA0]+)\*?/);
        const wm = response.match(/📈 Wygrane:\s*\*?([\d\s\xA0]+)\*?/);
        const lm = response.match(/📉 Przegrane:\s*\*?([\d\s\xA0]+)\*?/);
        const bm = response.match(/👛 Portfel:\s*💰\s*([\d\s\xA0]+)/);
        const bnk = response.match(/🏦 Bank:\s*💰\s*([\d\s\xA0]+)/);
        const nameM = response.match(/👤\s*\*?Profil:\s*([^\n*]+)\*?/);

        return {
          userId,
          name: nameM ? nameM[1].trim() : `Użytkownik_${userId.slice(-6)}`,
          level: lvl ? Number(lvl[1]) : 1,
          prestige: pres ? Number(pres[1]) : 0,
          gamesPlayed: gm ? parseMoney(gm[1]) : 0,
          commandsUsed: cm ? parseMoney(cm[1]) : 0,
          messageCount: mm ? parseMoney(mm[1]) : 0,
          wins: wm ? parseMoney(wm[1]) : 0,
          losses: lm ? parseMoney(lm[1]) : 0,
          balance: bm ? parseMoney(bm[1]) : 5000,
          bank: bnk ? parseMoney(bnk[1]) : 10000
        };
      }

      const pfpList = Object.values(progress.stats.pfp || {});
      const parsedProfiles = pfpList.map(p => parseProfileResponse(p.response, p.userId));

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
        pfp: pfpList,
        profiles: parsedProfiles,
        gang: Object.values(progress.stats.gang)
      };

      const processedPath = path.join(DATA_DIR, `zczytajapi_parsed_${Date.now()}.json`);
      fs.writeFileSync(processedPath, JSON.stringify(processedData, null, 2), 'utf8');

      // --- PLIK 3: Czytelny raport tekstowy (TXT) ---
      let txtContent = 
        `==================================================\n` +
        `       RAPORT Z ODZYSKANYCH PROFILI GRACZY\n` +
        `==================================================\n` +
        `Wygenerowano: ${new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}\n` +
        `Okres skanowania: ${scanFromStr} → ${scanToStr}\n` +
        `Liczba profili: ${parsedProfiles.length}\n\n` +
        `LISTA GRACZY (posortowana od najwyższego poziomu):\n` +
        `--------------------------------------------------\n`;

      // Sortuj graczy wg poziomu, a potem wg prestiżu i majątku
      const sortedProfilesForTxt = [...parsedProfiles].sort((a, b) => {
        if (b.level !== a.level) return b.level - a.level;
        if (b.prestige !== a.prestige) return b.prestige - a.prestige;
        return (b.balance + b.bank) - (a.balance + a.bank);
      });

      sortedProfilesForTxt.forEach((p, idx) => {
        txtContent += 
          `${idx + 1}. ${p.name} (ID: ${p.userId})\n` +
          `   🏆 Poziom: ${p.level} [Prestiż ${p.prestige}]\n` +
          `   💰 Portfel: ${p.balance.toLocaleString('pl-PL')} | 🏦 Bank: ${p.bank.toLocaleString('pl-PL')} (Łącznie: ${(p.balance + p.bank).toLocaleString('pl-PL')})\n` +
          `   💬 Wiadomości: ${p.messageCount.toLocaleString('pl-PL')} | ⌨️ Komendy: ${p.commandsUsed.toLocaleString('pl-PL')}\n` +
          `   🎮 Gry: ${p.gamesPlayed.toLocaleString('pl-PL')} (Wygrane: ${p.wins.toLocaleString('pl-PL')} | Przegrane: ${p.losses.toLocaleString('pl-PL')})\n` +
          `--------------------------------------------------\n`;
      });

      const txtReportPath = path.join(DATA_DIR, `zczytajapi_raport_${Date.now()}.txt`);
      fs.writeFileSync(txtReportPath, txtContent, 'utf8');

      try {
        await new Promise((resolve, reject) => {
          client.api.sendMessage({
            body: `📄 **PLIK 2: Sparsowane staty (JSON)**\n` +
                  `💰 bal: ${processedData.bal.length} | 🎒 eq: ${processedData.eq.length}\n` +
                  `📆 daily: ${processedData.daily.length} | 📅 topdaily: ${processedData.topdaily.length}\n` +
                  `🏆 top: ${processedData.top.length} | 👤 profile (sparsowane): ${processedData.profiles.length} | 👥 gang: ${processedData.gang.length}`,
            attachment: fs.createReadStream(processedPath)
          }, currentThreadId, (err) => {
            if (err) reject(err); else resolve();
          });
        });
      } catch (err) {
        await message.reply(`❌ Nie udało się wysłać pliku JSON: ${err.message}`);
      }

      try {
        await new Promise((resolve, reject) => {
          client.api.sendMessage({
            body: `📝 **PLIK 3: Czytelny raport tekstowy (TXT)**\n` +
                  `Zawiera listę wszystkich graczy posortowaną od najwyższego poziomu.\n` +
                  `Otwórz ten plik bezpośrednio na telefonie, aby szybko przejrzeć dane bez ściągania JSON-a!`,
            attachment: fs.createReadStream(txtReportPath)
          }, currentThreadId, (err) => {
            if (err) reject(err); else resolve();
          });
        });
      } catch (err) {
        await message.reply(`❌ Nie udało się wysłać raportu tekstowego: ${err.message}`);
      }

      // Czyszczenie plików tymczasowych
      try { fs.unlinkSync(rawExportPath); } catch {}
      try { fs.unlinkSync(processedPath); } catch {}
      try { fs.unlinkSync(txtReportPath); } catch {}
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
    const PAGE_SIZE = 200;
    const MAX_PAGES_PER_GROUP = 10;           // 10 * 200 = 2000 wiad./grupę
    const MAX_MESSAGES_PER_GROUP = 1000;
    const PAGE_DELAY_MS = 500;                // mniej opóźnień między stronami
    const GROUP_DELAY_MS = 2000;              // więcej opóźnień między grupami
    const MAX_GROUPS_PER_RUN = 10;            // więcej grup na bieg
    const MAX_CONSECUTIVE_ERRORS = 5;
    const MAX_EMPTY_PAGES = 2;
    const STOP_CHECK_INTERVAL = 10;
    const MAX_WINDOW_MS = 6 * 60 * 60 * 1000; // max 6h okno czasowe

    let groupsThisRun = 0;
    let commandsThisRun = 0;
    const skippedThreads = new Set(progress.skippedThreads || []);

    if (!client.zczytajState) {
      client.zczytajState = {};
    }
    client.zczytajState.active = true;
    client.zczytajState.stopRequested = false;

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

        const threadIdStr = String(threadId);
        if (skippedThreads.has(threadIdStr)) {
          console.log(`[ZCZYTAJAPI] Pomijam ${threadId} - była już pominięta wcześniej.`);
          continue;
        }

        groupsThisRun++;
        console.log(`[ZCZYTAJAPI] [${groupsThisRun}/${Math.min(remainingThreads.length, MAX_GROUPS_PER_RUN)}] Skanuję grupę ${threadId}...`);

        let oldestTimestamp = (scanTo && scanTo <= Date.now()) ? scanTo : null;
        let pagesScanned = 0;
        let groupMsgsScanned = 0;
        let emptyPages = 0;
        let groupErrors = 0;
        const groupMessages = [];

        while (pagesScanned < MAX_PAGES_PER_GROUP) {
          await safeDelay(PAGE_DELAY_MS);

          const history = await getThreadHistoryPage(client.api, threadId, PAGE_SIZE, oldestTimestamp);

          if (history === null) {
            groupErrors++;
            console.warn(`[ZCZYTAJAPI] Grupa ${threadId}: błąd API (${groupErrors}), pomijam.`);
            skippedThreads.add(threadIdStr);
            break;
          }

          pagesScanned++;
          groupMsgsScanned += history.length;

          if (history.length === 0) {
            emptyPages++;
            console.log(`[ZCZYTAJAPI] Grupa ${threadId}: pusta strona ${pagesScanned} (${emptyPages}/${MAX_EMPTY_PAGES})`);
            if (emptyPages >= MAX_EMPTY_PAGES) {
              console.log(`[ZCZYTAJAPI] Grupa ${threadId}: za dużo pustych stron, pomijam.`);
              skippedThreads.add(threadIdStr);
              break;
            }
            continue;
          }

          emptyPages = 0;

          let pageOldest = Infinity;
          for (const msg of history) {
            const ts = Number(msg.timestamp);
            if (ts < pageOldest) pageOldest = ts;
            if (ts > scanTo || ts < scanFrom) continue;

            const body = (msg.body || '').trim();
            const senderID = msg.senderID ? String(msg.senderID) : null;
            if (!body || !senderID) continue;

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
          if (pageOldest >= oldestTimestamp) {
            console.warn(`[ZCZYTAJAPI] Grupa ${threadId}: zapętlona paginacja, pomijam.`);
            skippedThreads.add(threadIdStr);
            break;
          }
          oldestTimestamp = pageOldest - 1;

          progress.totalMessagesScanned += history.length;

          if (pagesScanned % STOP_CHECK_INTERVAL === 0 && client.zczytajState && client.zczytajState.stopRequested) {
            console.log(`[ZCZYTAJAPI] Grupa ${threadId}: zatrzymano na życzenie użytkownika.`);
            await message.reply('🛑 **Zczytajapi zatrzymane** na życzenie użytkownika. Postęp zapisany.');
            saveProgress(progress);
            saveRawEntries(rawEntries);
            if (client.zczytajState) {
              client.zczytajState.active = false;
              client.zczytajState.stopRequested = false;
            }
            return;
          }

          if (pagesScanned % 20 === 0) {
            console.log(`[ZCZYTAJAPI] Grupa ${threadId}: ${pagesScanned} stron, ${groupMsgsScanned} wiad., ${groupMessages.length} komend/odpowiedzi`);
          }
        }

        // Sortuj chronologicznie
        groupMessages.sort((a, b) => a.ts - b.ts);

        // Dodaj WSZYSTKIE surowe wpisy (komendy + odpowiedzi bota) w obrębie zadanego okna
        for (const msg of groupMessages) {
          if (!isWithinScanWindow(msg.ts)) continue;
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
        progress.skippedThreads = Array.from(skippedThreads);
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

      if (client.zczytajState) {
        client.zczytajState.active = false;
        client.zczytajState.stopRequested = false;
      }

      let statusMsg =
        `📦 **Bieg #${progress.runs} zakończony!**\n` +
        `• Grupy w tym biegu: ${groupsThisRun}\n` +
        `• Komendy w tym biegu: ${commandsThisRun}\n` +
        `• Surowe wpisy łącznie: ${rawEntries.length}\n` +
        `• Komendy sparsowane łącznie: ${progress.totalCommandsFound}\n`;

      if (skippedThreads.size > 0) {
        statusMsg += `\n⚠️ **Pominięto ${skippedThreads.size} grup** (błąd API / pusta historia / E2EE)\n`;
      }

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
      if (client.zczytajState) {
        client.zczytajState.active = false;
        client.zczytajState.stopRequested = false;
      }
      await message.reply(`❌ Błąd: ${err.message}\nPostęp zapisany.`);
    }
  }
};
