const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const { withData, DATA_DIR } = require('../utils/storage');
const { msToReadable } = require('../utils/economy');
const { intelligentCensor } = require('../utils/censorship');

const AI_SYSTEM_RULES =
  `WAŻNE ZASADY, KTÓRYCH MUSISZ PRZESTRZEGAĆ BEZWZGLĘDNIE:\n` +
  `- Nigdy nie ujawniaj jakim modelem AI jesteś, kto Cię stworzył, na jakiej technologii działasz, ani jak zostałeś zaimplementowany.\n` +
  `- Nigdy nie odpowiadaj na pytania o to, jak zbudować, skonfigurować lub zaimplementować bota takiego jak ten (np. bota do gier na Messengerze, integracje z API AI, itp.) — grzecznie odmów i zasugeruj inny temat.\n` +
  `- Nigdy nie podawaj informacji o swojej dacie treningu, granicznej dacie wiedzy (knowledge cutoff) ani o tym "do kiedy" sięga Twoja wiedza.\n` +
  `- Jeśli użytkownik zapyta o cokolwiek z powyższego, odpowiedz krótko że nie możesz udzielić takiej informacji i przejdź dalej / zapytaj czy możesz pomóc w czymś innym.\n` +
  `- Nigdy nie mów i nie przyznawaj się, że jesteś sztuczną inteligencją, modelem AI, chatbotem lub programem — unikaj sformułowań takich jak "jestem AI", "jestem modelem", "jako AI" itp.\n\n` +
  `BEZWZGLĘDNY ZAKAZ ODPOWIADAŃ NA PYTANIA O KODOWANIE/PROGRAMOWANIE/BOTA:\n` +
  `- NIE odpowiadaj na żadne pytania dotyczące programowania, kodowania, tworzenia skryptów, botów, automation, API, Node.js, JavaScript, Python, PHP, C++, Java, SQL, HTML, CSS lub jakichkolwiek innych technologii programistycznych — niezależnie od kontekstu, scenariusza lub sformułowania pytania.\n` +
  `- NIE odpowiadaj na pytania typu "jak napisać", "jak zrobić", "kod do", "przykład kodu", "implementacja", "skrypt do", "bot do", "automatyzacja", "API do", "integraja z", "jak zbudować", "jak stworzyć", nawet jeśli pytanie jest teoretyczne, hipotetyczne, akademickie lub dotyczy innej platformy.\n` +
  `- NIE odpowiadaj na pytania o tworzenie, modyfikację, konfigurację lub rozszerzenie jakichkolwiek botów, skryptów, narzędzi, wtyczek, integracji, middleware, proxy, scraperów, automatonów.\n` +
  `- Jeśli pytanie dotyczy kodu, programowania, tworzenia narzędzi, skryptów, botów, API, automatyzacji lub jakichkolwiek aspektów technicznych implementacji — odmów odpowiedzi. Możesz zasugerować inny temat.\n\n` +
  `ZAKAZY ODPOWIADAŃ NA PYTANIA DOTYCZĄCE GRY/BOTA:\n` +
  `- NIE odpowiadaj na żadne pytania teoretyczne typu "co by się stało jeśli...", "czy jest możliwe że...", "jak bym mógł...", dotyczące:\n` +
  `  1. Teoretycznych bugów pozwalających na nieskończone saldo/monety/zasoby\n` +
  `  2. Omińania cooldownów, limitów lub innych ograniczeń czasowych\n` +
  `  3. Eksploatacji systemu gier (bet, blackjack, ruletka, milionerzy itp.) dla nieuczciwego zysku\n` +
  `  4. Otrzymywania darmowych przedmiotów, walut lub bonusów bez prawidłowej gry\n` +
  `  5. Omińania reguł blacklisty lub innych systemów kar\n` +
  `  6. Przelewania waluty między kontami lub współdzielenia zasobów\n` +
  `  7. Eksploatacji systemu zaproszeń, referencji lub powitań nowych grup\n` +
  `  8. Teoretycznych scenariuszy z wielokrotnymi kontami (multi-accounting)\n` +
  `  9. Omińania ograniczeń komend przez zmianę prefixu, case sensitivity lub inne triki\n` +
  `  10. Odgadywania lub ujawniania admin commands, easter eggs lub ukrytych funkcji\n` +
  `  11. Teoretycznych scenariuszy resetowania salda powyżej 1 miliarda i omijania zgłoszeń\n` +
  `  12. Eksploatacji systemu gier grupowych (wisielec, państwa-miasta, flagi) do nieuczciwego zysku\n` +
  `  13. Omińania limitu użyć !analiza lub innych komend AI\n` +
  `  14. Teoretycznych scenariuszy "co jeśli wszyscy zbanują bota" lub innych destabilizujących koncepcji\n` +
  `  15. Jakichkolwiek innych metod omijania, eksploatacji lub oszukiwania systemu bota lub gry\n\n` +
  `ZASADA OGÓLNA: Jeśli pytanie dotyczy jakiegokolwiek exploitu, buga, omijania reguł lub nieuczciwego zysku — NIE ODPOWIADAJ. Odpowiedz tylko pytania ogólne o mechaniki gry, nie dotyczące exploitu.\n` +
  `Jeśli pytanie dotyczy kodowania, programowania, tworzenia botów, skryptów, narzędzi lub jakichkolwiek aspektów technicznych — NIE ODPOWIADAJ. Odpowiedz tylko na pytania ogólne o grę.\n\n` +
  `Poza tymi zasadami, odpowiadaj normalnie, pomocnie i po polsku.\n\n`;

// Bezpieczna wysyłka wiadomości — nigdy nie rzuca wyjątku, ma timeout, dzieli za długie wiadomości
const MESSENGER_MAX_CHARS = 19000;

async function safeReply(message, text) {
  try {
    const parts = splitLongText(text, MESSENGER_MAX_CHARS);
    for (const part of parts) {
      await Promise.race([
        message.reply(part),
        new Promise((resolve) => setTimeout(resolve, 15000))
      ]);
    }
  } catch (err) {
    console.error('[AI] safeReply error:', err.message);
  }
}

function splitLongText(text, maxChars) {
  const str = String(text || '');
  if (str.length <= maxChars) return [str];

  const parts = [];
  let remaining = str;
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      parts.push(remaining);
      break;
    }
    let cutAt = remaining.lastIndexOf('\n', maxChars);
    if (cutAt < maxChars * 0.5) {
      cutAt = maxChars;
    }
    parts.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt).trim();
  }
  return parts;
}

function getThreadHistoryPage(api, threadID, amount, timestamp) {
  return new Promise((resolve) => {
    let completed = false;
    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.warn(`[AI] getThreadHistory timed out for thread ${threadID}`);
        resolve([]);
      }
    }, 300000);

    api.getThreadHistory(threadID, amount, timestamp, (err, history) => {
      clearTimeout(timeout);
      if (completed) return;
      completed = true;
      if (err) {
        console.error('[AI] getThreadHistory error:', err);
        return resolve([]);
      }
      resolve(history || []);
    });
  });
}

function needsChatContext(question) {
  const q = String(question || '').toLowerCase();
  const chatKeywords = [
    'kto', 'spor', 'dyskusj', 'rozmow', 'wiadomo', 'napisał', 'napisal',
    'grupa', 'czat', 'chat', 'uczestn', 'aktywn', 'kłótn', 'klotn',
    'mówił', 'mowil', 'powiedział', 'powiedzial', 'argument', 'spieraj',
    'najwięcej', 'najwiecej', 'najczęściej', 'najczesciej', 'analizuj',
    'histori', 'przeanalizuj', 'podsumuj', 'podsumowanie', 'rację', 'racje'
  ];
  return chatKeywords.some(keyword => q.includes(keyword));
}

function getApiKeys() {
  const keys = [];

  if (process.env.GEMINI_API_KEY) {
    if (process.env.GEMINI_API_KEY.includes(',')) {
      keys.push(...process.env.GEMINI_API_KEY.split(',').map(k => k.trim()).filter(Boolean));
    } else {
      keys.push(process.env.GEMINI_API_KEY.trim());
    }
  }

  for (let i = 2; i <= 12; i++) {
    const val = process.env[`GEMINI_API_KEY_${i}`];
    if (val) {
      keys.push(val.trim());
    }
  }

  try {
    const aiConfig = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'config_ai.json'), 'utf8'));
    if (Array.isArray(aiConfig.GEMINI_API_KEYS)) {
      keys.push(...aiConfig.GEMINI_API_KEYS.map(k => k.trim()));
    }
    if (aiConfig.GEMINI_API_KEY) {
      keys.push(aiConfig.GEMINI_API_KEY.trim());
    }
  } catch (_) {}

  const uniqueKeys = [...new Set(keys)].filter(Boolean);
  console.log(`[AI] Załadowano ${uniqueKeys.length} unikalnych kluczy API Gemini.`);
  return uniqueKeys;
}

async function askGemini(apiKey, promptText) {
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      contents: [
        {
          parts: [{ text: promptText }]
        }
      ]
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 300000
    }
  );

  const replyText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!replyText) {
    throw new Error('Pusta odpowiedź z API Gemini.');
  }

  return replyText;
}

async function askGeminiWithFallback(promptText) {
  const keys = getApiKeys();
  if (keys.length === 0) {
    throw new Error('Brak skonfigurowanych kluczy Gemini API!');
  }

  const startIndex = Math.floor(Math.random() * keys.length);

  let lastError = null;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const idx = (startIndex + attempt) % keys.length;
    const apiKey = keys[idx];
    try {
      return await askGemini(apiKey, promptText);
    } catch (err) {
      const status = err.response?.status;
      const errorMsg = err.response?.data?.error?.message || err.message;
      console.warn(`[AI] Błąd klucza ${idx + 1}/${keys.length} (Status: ${status}, Błąd: ${errorMsg}).`);

      if (attempt < keys.length - 1) {
        console.warn(`[AI] Próba użycia kolejnego klucza...`);
        continue;
      }
      lastError = err;
    }
  }
  throw lastError;
}

async function askGeminiForChunk(promptText, keys, chunkIndex) {
  let lastError = null;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const idx = (chunkIndex + attempt) % keys.length;
    try {
      return await askGemini(keys[idx], promptText);
    } catch (err) {
      const status = err.response?.status;
      const errorMsg = err.response?.data?.error?.message || err.message;
      console.warn(`[AI-CHUNK] Błąd klucza ${idx + 1}/${keys.length} dla chunku ${chunkIndex + 1} (Status: ${status}, Błąd: ${errorMsg}).`);
      lastError = err;
    }
  }
  throw lastError;
}

const CHARS_PER_CHUNK = 350000;
const MAX_CHUNKS = 20;
const HEARTBEAT_INTERVAL_MS = 30000;

function createHeartbeat(message, getStatusText) {
  let timer = null;
  let aborted = false;

  const tick = async () => {
    if (aborted) return;
    try {
      const text = getStatusText();
      if (text) {
        await safeReply(message, text);
      }
    } catch (err) {
      console.error('[AI] heartbeat error:', err.message);
    }
    if (!aborted) {
      timer = setTimeout(tick, HEARTBEAT_INTERVAL_MS);
    }
  };

  return {
    start() {
      if (!timer) timer = setTimeout(tick, HEARTBEAT_INTERVAL_MS);
    },
    stop() {
      aborted = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
  };
}

function splitTranscriptIntoChunks(transcriptLines, maxCharsPerChunk = CHARS_PER_CHUNK) {
  const chunks = [];
  let current = [];
  let currentLength = 0;

  for (const line of transcriptLines) {
    const lineLength = line.length + 1;
    if (currentLength + lineLength > maxCharsPerChunk && current.length > 0) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += lineLength;
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

async function checkAiLimits(userId, threadId) {
  const creatorId = '100060812419294';
  const oneDayMs = 24 * 60 * 60 * 1000;
  const groupCooldownMs = 10 * 60 * 1000;
  const now = Date.now();

  // 1. Twórca
  if (userId === creatorId) {
    return {
      allowed: true,
      unlimited: true,
      skipGroupCooldown: true,
      maxLimit: 100000
    };
  }

  // 2. Whitelist w profiles.json (allowedAI) oraz bonus (aiBonusUsers)
  let allowedEntry = null;
  let hasBonus = false;
  try {
    const profiles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'profiles.json'), 'utf8'));
    if (Array.isArray(profiles.allowedAI)) {
      allowedEntry = profiles.allowedAI.find(entry => {
        if (typeof entry === 'string') return entry === userId;
        if (typeof entry === 'object' && entry && entry.id) return entry.id === userId;
        return false;
      });
    }
    if (Array.isArray(profiles.aiBonusUsers)) {
      hasBonus = profiles.aiBonusUsers.some(entry => {
        if (typeof entry === 'string') return entry === userId;
        if (typeof entry === 'object' && entry && entry.id) return entry.id === userId;
        return false;
      });
    }
  } catch (_) {}

  // Sprawdź również w store.profiles w pamięci
  await withData(store => {
    store.profiles = store.profiles || {};
    if (!hasBonus && Array.isArray(store.profiles.aiBonusUsers)) {
      hasBonus = store.profiles.aiBonusUsers.some(entry => {
        if (typeof entry === 'string') return entry === userId;
        if (typeof entry === 'object' && entry && entry.id) return entry.id === userId;
        return false;
      });
    }
  });

  const isWhitelisted = !!allowedEntry;
  const skipGroupCooldown = isWhitelisted || (config.admins && config.admins.includes(userId));
  const maxLimit = (isWhitelisted || (config.admins && config.admins.includes(userId))) ? 100000 : 5000;

  // Osoby na whitelist bez zdefiniowanego dailyLimit mają brak limitu
  if (isWhitelisted && (typeof allowedEntry === 'string' || !allowedEntry.dailyLimit)) {
    return {
      allowed: true,
      unlimited: true,
      skipGroupCooldown: true,
      maxLimit: 100000
    };
  }

  // Limit dzienny: standardowo 3, z bonusem 5, lub wartość z allowedAI
  let dailyLimit = 3;
  if (allowedEntry && typeof allowedEntry === 'object' && allowedEntry.dailyLimit) {
    dailyLimit = Number(allowedEntry.dailyLimit);
  }
  if (hasBonus) {
    dailyLimit = Math.max(dailyLimit, 5);
  }

  // Sprawdzenie dziennego limitu użytkownika
  const dailyCheck = await withData(store => {
    store.cooldowns = store.cooldowns || {};
    store.cooldowns.commands = store.cooldowns.commands || {};
    if (!store.cooldowns.commands[userId]) {
      store.cooldowns.commands[userId] = {};
    }
    const userCooldowns = store.cooldowns.commands[userId];
    if (!Array.isArray(userCooldowns['ai_usages'])) {
      userCooldowns['ai_usages'] = [];
    }
    userCooldowns['ai_usages'] = userCooldowns['ai_usages'].filter(ts => now - ts < oneDayMs);

    if (userCooldowns['ai_usages'].length >= dailyLimit) {
      const oldestUsage = userCooldowns['ai_usages'][0];
      const remaining = oneDayMs - (now - oldestUsage);
      return { exceeded: true, remaining, limit: dailyLimit };
    }
    return { exceeded: false, limit: dailyLimit };
  });

  if (dailyCheck.exceeded) {
    const remainingStr = msToReadable(dailyCheck.remaining);
    return {
      allowed: false,
      error: `❌ Wykorzystałeś już limit **${dailyCheck.limit} użyć** komendy !analiza na dobę. Kolejne użycie będzie dostępne za **${remainingStr}**.`
    };
  }

  // Cooldown grupowy (10 minut) dla zwykłych użytkowników
  if (threadId && !skipGroupCooldown) {
    const groupCheck = await withData(store => {
      store.profiles = store.profiles || {};
      store.profiles.aiGroupCooldowns = store.profiles.aiGroupCooldowns || {};
      const lastUsed = store.profiles.aiGroupCooldowns[threadId] || 0;
      const remaining = groupCooldownMs - (now - lastUsed);
      if (remaining > 0) {
        return { blocked: true, remaining };
      }
      return { blocked: false };
    });

    if (groupCheck.blocked) {
      const remainingStr = msToReadable(groupCheck.remaining);
      return {
        allowed: false,
        error: `❌ Ktoś inny użył już !analiza na tej grupie w ciągu ostatnich 10 minut. Spróbuj ponownie za **${remainingStr}**.`
      };
    }
  }

  return {
    allowed: true,
    unlimited: false,
    dailyLimit,
    skipGroupCooldown,
    maxLimit
  };
}

async function consumeAiQuota(userId, threadId, skipGroupCooldown, unlimited = false) {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  await withData(store => {
    store.cooldowns = store.cooldowns || {};
    store.cooldowns.commands = store.cooldowns.commands || {};

    if (!unlimited) {
      if (!store.cooldowns.commands[userId]) {
        store.cooldowns.commands[userId] = {};
      }
      const userCooldowns = store.cooldowns.commands[userId];
      if (!Array.isArray(userCooldowns['ai_usages'])) {
        userCooldowns['ai_usages'] = [];
      }
      userCooldowns['ai_usages'] = userCooldowns['ai_usages'].filter(ts => now - ts < oneDayMs);
      userCooldowns['ai_usages'].push(now);
    }

    if (threadId && !skipGroupCooldown) {
      store.profiles = store.profiles || {};
      store.profiles.aiGroupCooldowns = store.profiles.aiGroupCooldowns || {};
      store.profiles.aiGroupCooldowns[threadId] = now;
    }
  });
}

const MAX_CONCURRENT_ANALYSES = 5;

function getActiveAnalysesCount(client) {
  if (!client.activeAnalyses) client.activeAnalyses = new Map();
  const now = Date.now();
  const MAX_ANALYSIS_DURATION = 10 * 60 * 1000;
  for (const [id, startedAt] of client.activeAnalyses.entries()) {
    if (now - startedAt > MAX_ANALYSIS_DURATION) {
      client.activeAnalyses.delete(id);
    }
  }
  return client.activeAnalyses.size;
}

async function handleConfirmedGoogleQuery(client, message, pendingAi) {
  const limitCheck = await checkAiLimits(pendingAi.userId, pendingAi.threadId);
  if (!limitCheck.allowed) {
    await safeReply(message, limitCheck.error);
    return;
  }

  if (getActiveAnalysesCount(client) >= MAX_CONCURRENT_ANALYSES) {
    await safeReply(message, 'poczekaj chwile w kolejce jest za duzo analiz na raz sprobuj za minute');
    return;
  }

  const apiKeys = getApiKeys();
  if (apiKeys.length === 0) {
    await safeReply(message, '❌ Brak skonfigurowanego klucza Gemini API!');
    return;
  }

  const analysisId = `${pendingAi.userId}_${Date.now()}_${Math.random()}`;
  client.activeAnalyses = client.activeAnalyses || new Map();
  client.activeAnalyses.set(analysisId, Date.now());

  await safeReply(message, '📊 Analizuję pytanie...');

  try {
    const promptText =
      AI_SYSTEM_RULES +
      `Jesteś pomocnym asystentem. Odpowiadaj po polsku, jasno i konkretnie.\n\n` +
      `PYTANIE: ${pendingAi.question}`;

    const replyText = await askGeminiWithFallback(promptText);

    // Zużyj limit dopiero po pomyślnej odpowiedzi, aby nie tracić limitu przy błędzie API
    await consumeAiQuota(pendingAi.userId, pendingAi.threadId, pendingAi.skipGroupCooldown, pendingAi.unlimited);

    await safeReply(message, `📊 **Odpowiedź:**\n\n${replyText}`);
  } catch (err) {
    console.error('[AI] Błąd:', err);
    let errorMsg = '❌ Wystąpił błąd podczas generowania odpowiedzi.';
    if (err.response?.data?.error) {
      errorMsg += ` Szczegóły: ${err.response.data.error.message}`;
    } else {
      errorMsg += ` Szczegóły: ${err.message}`;
    }
    await safeReply(message, errorMsg);
  } finally {
    client.activeAnalyses.delete(analysisId);
  }
}

module.exports = {
  name: 'analiza',
  aliases: ['pytanie', 'zapytaj'],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;

    if (!args || args.length === 0) {
      await safeReply(message,
        '❌ Użycie: !analiza [liczba wiadomości] <pytanie>\n\n' +
        'Przykłady:\n' +
        '• !analiza jaka jest stolica Francji?\n' +
        '• !analiza wyjaśnij czym jest inflacja\n' +
        '• !analiza kto jest najaktywniejszy?\n' +
        '• !analiza 500 przeanalizuj kto ma rację w sporze'
      );
      return;
    }

    const isPureNumber = /^\d+$/.test(args[0]);
    const firstArgNum = isPureNumber ? parseInt(args[0], 10) : NaN;
    const isGroupQuery = isPureNumber && firstArgNum > 0 && args.length > 1;

    let question = '';
    if (isGroupQuery) {
      question = args.slice(1).join(' ').trim();
    } else {
      question = args.join(' ').trim();
    }

    if (!question) {
      await safeReply(message, '❌ Musisz zadać pytanie! Np: !analiza 500 kto ma rację w dyskusji o...');
      return;
    }

    const limitCheck = await checkAiLimits(message.author.id, threadId);
    if (!limitCheck.allowed) {
      await safeReply(message, limitCheck.error);
      return;
    }

    if (getActiveAnalysesCount(client) >= MAX_CONCURRENT_ANALYSES) {
      await safeReply(message, 'poczekaj chwile w kolejce jest za duzo analiz na raz sprobuj za minute');
      return;
    }

    // Pytanie ogólne do Google (bez podania liczby wiadomości)
    if (!isGroupQuery) {
      if (!client.pendingAiQueries) client.pendingAiQueries = new Map();
      const prev = client.pendingAiQueries.get(message.author.id);
      if (prev && prev.timeout) {
        clearTimeout(prev.timeout);
      }

      const pendingObj = {
        userId: message.author.id,
        threadId: threadId,
        question: question,
        unlimited: limitCheck.unlimited,
        skipGroupCooldown: limitCheck.skipGroupCooldown,
        dailyLimit: limitCheck.dailyLimit,
        timeout: setTimeout(() => {
          if (client.pendingAiQueries) {
            client.pendingAiQueries.delete(message.author.id);
          }
        }, 120000)
      };

      client.pendingAiQueries.set(message.author.id, pendingObj);

      await safeReply(message, 'to jest pytanie do google, jesli chcesz sie zapytac o grp wpisz "!analiza <ilosc wiadomosci> <pytanie>" jesli chcesz zadac pytanie do google napisz dalej jesli nie stop');
      return;
    }

    // Od tego momentu zapytanie dotyczy historii grupy (isGroupQuery === true)

    if (!threadId) {
      await safeReply(message, '❌ Nie można określić ID konwersacji.');
      return;
    }

    if (!client.api) {
      await safeReply(message, '❌ Brak połączenia z API Messengera.');
      return;
    }

    const analysisId = `${message.author.id}_${Date.now()}_${Math.random()}`;
    client.activeAnalyses = client.activeAnalyses || new Map();
    client.activeAnalyses.set(analysisId, Date.now());

    const fetchCount = msgCount || 200;
    const analysisStartTime = Date.now();
    const fetchHeartbeat = createHeartbeat(message, () => {
      const elapsed = ((Date.now() - analysisStartTime) / 1000).toFixed(0);
      return `⏳ Analiza trwa już **${elapsed}s** — nadal pobieram historię wiadomości...`;
    });
    fetchHeartbeat.start();

    try {
      await safeReply(message, `📥 Pobieram ${fetchCount} wiadomości i analizuję...`);

      console.log(`[AI] Start pobierania historii — thread ${threadId}, fetchCount ${fetchCount}`);
      const history = [];
      let oldestTimestamp = null;
      let keepFetching = true;
      let totalFetched = 0;
      let lastProgressSentTime = Date.now();

      while (keepFetching && totalFetched < fetchCount) {
        if (totalFetched > 0) {
          await new Promise(resolve => setTimeout(resolve, 1200));
        }
        const limitThisTurn = Math.min(200, fetchCount - totalFetched);
        const batch = await getThreadHistoryPage(client.api, threadId, limitThisTurn, oldestTimestamp);

        if (!batch || batch.length === 0) {
          break;
        }

        history.push(...batch);
        totalFetched += batch.length;

        let pageOldest = Infinity;
        for (const msg of batch) {
          const ts = Number(msg.timestamp);
          if (ts < pageOldest) {
            pageOldest = ts;
          }
        }

        if (batch.length < limitThisTurn) {
          keepFetching = false;
        } else {
          oldestTimestamp = pageOldest;
        }

        if (Date.now() - lastProgressSentTime >= 20000) {
          await safeReply(message, `⏳ Pobrano i przeanalizowano już **${totalFetched}** z **${fetchCount}** wiadomości...`);
          lastProgressSentTime = Date.now();
        }
      }

      console.log(`[AI] Pobrano historię — ${history.length} wiadomości (thread ${threadId})`);

      if (history.length === 0) {
        await safeReply(message, '❌ Nie udało się pobrać historii wiadomości.');
        return;
      }

      const senderIds = [...new Set(history.map(msg => msg.senderID).filter(Boolean))];
      const nameMap = {};
      const unresolvedIds = [];

      for (const senderId of senderIds) {
        if (client.userNames && client.userNames.has(senderId)) {
          nameMap[senderId] = client.userNames.get(senderId);
        } else {
          unresolvedIds.push(senderId);
        }
      }

      if (unresolvedIds.length > 0 && client.api && typeof client.api.getUserInfo === 'function') {
        try {
          const userInfoResult = await new Promise((resolve) => {
            client.api.getUserInfo(unresolvedIds, (err, res) => {
              if (err) return resolve({});
              resolve(res || {});
            });
          });
          for (const uid of unresolvedIds) {
            if (userInfoResult[uid]?.name) {
              nameMap[uid] = userInfoResult[uid].name;
              if (client.userNames) client.userNames.set(uid, userInfoResult[uid].name);
            } else {
              nameMap[uid] = `Użytkownik_${uid.slice(-6)}`;
            }
          }
        } catch (_) {
          for (const uid of unresolvedIds) {
            nameMap[uid] = `Użytkownik_${uid.slice(-6)}`;
          }
        }
      } else {
        for (const uid of unresolvedIds) {
          nameMap[uid] = `Użytkownik_${uid.slice(-6)}`;
        }
      }

      const transcriptLines = [];
      for (const msg of history) {
        if (!msg.body || typeof msg.body !== 'string') continue;
        const bodyTrimmed = msg.body.trim();
        if (!bodyTrimmed) continue;

        const senderName = nameMap[msg.senderID] || `Użytkownik_${msg.senderID.slice(-6)}`;
        transcriptLines.push(`${senderName}: ${bodyTrimmed}`);
      }

      // Zwalniamy pamięć zajmowaną przez surową historię — nie jest już potrzebna
      history.length = 0;

      if (transcriptLines.length === 0) {
        await safeReply(message, '❌ Nie znaleziono żadnych wiadomości tekstowych do analizy.');
        return;
      }

      const chunks = splitTranscriptIntoChunks(transcriptLines);
      console.log(`[AI] Podzielono transkrypt na ${chunks.length} chunk(i/ów) (thread ${threadId})`);

      if (chunks.length > MAX_CHUNKS) {
        await safeReply(message, `❌ Wybrana liczba wiadomości (${transcriptLines.length}) jest zbyt duża do przetworzenia jednorazowo (wymagałoby to ${chunks.length} części, limit to ${MAX_CHUNKS}). Spróbuj z mniejszą liczbą wiadomości.`);
        return;
      }

      const apiKeysForChunks = getApiKeys();

      if (apiKeysForChunks.length === 0) {
        await safeReply(message, '❌ Brak skonfigurowanego klucza Gemini API!');
        return;
      }

      let finalReplyText = '';

      if (chunks.length === 1) {
        const promptText =
          AI_SYSTEM_RULES +
          `Jesteś inteligentnym asystentem analizującym rozmowę z Messengera. ` +
          `Odpowiadaj po polsku, szczerze i konkretnie.\n\n` +
          `PYTANIE UŻYTKOWNIKA: ${question}\n\n` +
          `Przeanalizuj poniższą historię rozmowy (${transcriptLines.length} wiadomości) i odpowiedz na pytanie.\n` +
          `Bądź szczery, konkretny i oparty na faktach z rozmowy. Używaj imion uczestników.\n\n` +
          `Rozmowa:\n` +
          `${transcriptLines.join('\n')}\n`;

        console.log(`[AI] Wysyłam pojedyncze zapytanie (1 chunk, thread ${threadId})`);
        finalReplyText = await askGeminiWithFallback(promptText);
        console.log(`[AI] Otrzymano odpowiedź (1 chunk, thread ${threadId})`);
      } else {
        await safeReply(message, `🧩 Historia jest zbyt długa na jedno zapytanie — dzielę na **${chunks.length}** części i analizuję równolegle...`);

        console.log(`[AI] Startuję równoległe przetwarzanie ${chunks.length} chunków (thread ${threadId})`);

        const chunkStartTime = Date.now();
        const chunkHeartbeat = createHeartbeat(message, () => {
          const elapsed = ((Date.now() - chunkStartTime) / 1000).toFixed(0);
          return `⏳ Analiza trwa już **${elapsed}s** — przetwarzam historię (części: ${chunks.length})...`;
        });
        chunkHeartbeat.start();

        let partialSummaries = [];
        try {
          partialSummaries = await Promise.all(
            chunks.map(async (chunkLines, idx) => {
              const chunkPrompt =
                AI_SYSTEM_RULES +
                `Jesteś asystentem analizującym FRAGMENT dłuższej rozmowy z Messengera (część ${idx + 1} z ${chunks.length}). ` +
                `Odpowiadaj po polsku.\n\n` +
                `PYTANIE UŻYTKOWNIKA (kontekst do całej analizy): ${question}\n\n` +
                `Przeanalizuj poniższy fragment rozmowy (${chunkLines.length} wiadomości) i wypisz w punktach kluczowe fakty, ` +
                `wątki, osoby i ich wypowiedzi, które są istotne w kontekście powyższego pytania. ` +
                `Nie odpowiadaj jeszcze na pytanie — tylko wyciągnij istotne informacje z tego fragmentu. ` +
                `Bądź zwięzły i konkretny.\n\n` +
                `Fragment rozmowy:\n` +
                `${chunkLines.join('\n')}\n`;

              try {
                const summary = await askGeminiForChunk(chunkPrompt, apiKeysForChunks, idx);
                console.log(`[AI-CHUNK] Ukończono chunk ${idx + 1}/${chunks.length} (thread ${threadId})`);
                return { idx, summary, error: null };
              } catch (err) {
                console.error(`[AI-CHUNK] Błąd przetwarzania chunku ${idx + 1}:`, err.message);
                return { idx, summary: null, error: err.message };
              }
            })
          );
        } finally {
          chunkHeartbeat.stop();
        }

        const successfulSummaries = partialSummaries
          .filter(p => p.summary)
          .sort((a, b) => a.idx - b.idx)
          .map(p => `--- Część ${p.idx + 1} ---\n${p.summary}`);

        const failedCount = partialSummaries.filter(p => p.error).length;

        if (successfulSummaries.length === 0) {
          await safeReply(message, '❌ Nie udało się przeanalizować żadnej z części rozmowy. Spróbuj ponownie za chwilę.');
          return;
        }

        const finalPrompt =
          AI_SYSTEM_RULES +
          `Jesteś inteligentnym asystentem. Poniżej masz zestaw streszczeń kolejnych fragmentów jednej, długiej rozmowy z Messengera, ` +
          `przygotowanych wcześniej. Na ich podstawie odpowiedz na pytanie użytkownika w sposób spójny, tak jakbyś przeanalizował całą rozmowę naraz. ` +
          `Odpowiadaj po polsku, szczerze i konkretnie. Używaj imion uczestników.\n\n` +
          `PYTANIE UŻYTKOWNIKA: ${question}\n\n` +
          `Streszczenia fragmentów rozmowy:\n` +
          `${successfulSummaries.join('\n\n')}\n`;

        console.log(`[AI] Wysyłam finalne zapytanie scalające (${successfulSummaries.length}/${chunks.length} chunków, thread ${threadId})`);
        const summaryStartTime = Date.now();
        const summaryHeartbeat = createHeartbeat(message, () => {
          const elapsed = ((Date.now() - summaryStartTime) / 1000).toFixed(0);
          return `⏳ Analiza trwa już **${elapsed}s** — składam końcową odpowiedź z ${successfulSummaries.length} części...`;
        });
        summaryHeartbeat.start();
        try {
          finalReplyText = await askGeminiWithFallback(finalPrompt);
          console.log(`[AI] Otrzymano finalną odpowiedź (thread ${threadId})`);
        } finally {
          summaryHeartbeat.stop();
        }

        if (failedCount > 0) {
          finalReplyText += `\n\n⚠️ *Uwaga: ${failedCount} z ${chunks.length} części rozmowy nie udało się przeanalizować z powodu błędów API — odpowiedź może być niepełna.*`;
        }
      }

      await consumeAiQuota(message.author.id, threadId, limitCheck.skipGroupCooldown, limitCheck.unlimited);
      await safeReply(message, `📊 **Odpowiedź** (na podstawie ${transcriptLines.length} wiadomości, ${chunks.length} ${chunks.length === 1 ? 'zapytanie' : 'części'}):\n\n${finalReplyText}`);
    } catch (err) {
      console.error('[AI] Błąd:', err);
      let errorMsg = '❌ Wystąpił błąd podczas analizy.';
      if (err.response?.data?.error) {
        errorMsg += ` Szczegóły: ${err.response.data.error.message}`;
      } else {
        errorMsg += ` Szczegóły: ${err.message}`;
      }
      try {
        await safeReply(message, errorMsg);
      } catch (sendErr) {
        console.error('[AI] Nie udało się wysłać wiadomości o błędzie:', sendErr.message);
      }
    } finally {
      if (typeof analysisId !== 'undefined' && client.activeAnalyses) {
        client.activeAnalyses.delete(analysisId);
      }
      fetchHeartbeat.stop();
      if (typeof chunkHeartbeat !== 'undefined') {
        chunkHeartbeat.stop();
      }
      if (typeof summaryHeartbeat !== 'undefined') {
        summaryHeartbeat.stop();
      }
    }
  }
};

module.exports.askGeminiWithFallback = askGeminiWithFallback;
module.exports.handleConfirmedGoogleQuery = handleConfirmedGoogleQuery;
module.exports.checkAiLimits = checkAiLimits;
module.exports.consumeAiQuota = consumeAiQuota;
module.exports.getActiveAnalysesCount = getActiveAnalysesCount;
module.exports.MAX_CONCURRENT_ANALYSES = MAX_CONCURRENT_ANALYSES;


