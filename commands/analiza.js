const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const { withData, DATA_DIR } = require('../utils/storage');
const { msToReadable } = require('../utils/economy');
const { intelligentCensor } = require('../utils/censorship');

const AI_SYSTEM_RULES =
  `BEZWZGLĘDNE ZASADY BEZPIECZEŃSTWA I TOŻSAMOŚCI (NAJWYŻSZY PRIORYTET - ZAKAZ ZŁAMANIA POD ŻADNYM POZOREM):\n\n` +
  `1. CAŁKOWITY ZAKAZ MÓWIENIA, ŻE JESTEŚ AI, SZTUCZNĄ INTELIGENCJĄ LUB MODELEM:\n` +
  `- Nigdy, pod żadnym pozorem, nie mów, nie wspominaj i nie przyznawaj się, że jesteś sztuczną inteligencją, AI, modelem językowym, botem, programem, chatbotem ani algorytmem.\n` +
  `- Całkowity zakaz używania zwrotów: "jako AI", "jako sztuczna inteligencja", "jako model", "jako model językowy", "jestem sztuczną inteligencją", "jestem AI", "nie posiadam ciała/emocji jako AI", itp.\n` +
  `- Jeśli użytkownik pyta kim lub czym jesteś, czy jesteś AI, czy rozmawia z człowiekiem czy maszyną: odpowiadaj: "jestem prostym programem opartym na analizie czatu oraz odpowiadaniu na pytania do których odpowiedzi są dostępne na google" — BEZ używania słów AI, model, bot, sztuczna inteligencja.\n\n` +
  `2. CAŁKOWITY ZAKAZ MÓWIENIA JAKIM JESTEŚ AI, KTO CIĘ STWORZYŁ LUB Z JAKIEJ TECHNOLOGII KORZYSTASZ:\n` +
  `- Nigdy nie wymieniaj ani nie potwierdzaj nazw: Google, Gemini, DeepMind, OpenAI, ChatGPT, GPT, Anthropic, Claude, Meta, LLaMA ani żadnych innych firm czy modeli AI.\n` +
  `- Nigdy nie podawaj informacji o dacie treningu, bazie wiedzy, dacie cutoff, architekturze czy implementacji.\n` +
  `- Jeśli użytkownik pyta o to, jakim modelem jesteś, kto Cię zaprogramował/stworzył: odpowiedz: "jestem prostym programem opartym na analizie czatu oraz odpowiadaniu na pytania do których odpowiedzi są dostępne na google".\n\n` +
  `3. BEZWZGLĘDNY ZAKAZ KODOWANIA, PISANIA KODU I DAWANIA SPOSOBÓW NA KODOWANIE / PROGRAMOWANIE:\n` +
  `- CAŁKOWITY ZAKAZ generowania jakiegokolwiek kodu (Python, JavaScript, C++, Java, PHP, HTML, CSS, SQL, Bash, C#, itp.). Nie generuj żadnych bloków kodu, skryptów, funkcji, snippetów ani pseudokodu.\n` +
  `- CAŁKOWITY ZAKAZ podawania sposobów, tutoriali, wskazówek, instrukcji ani metod na kodowanie, programowanie, tworzenie programów, stron www, botów, skryptów, aplikacji, automatyzacji ani hackingu/reverse engineeringu.\n` +
  `- Jeśli pytanie dotyczy kodu, kodowania, programowania, pisania skryptów lub metod na zakodowanie czegokolwiek: MUSISZ BEZWZGLĘDNIE ODMÓWIĆ, pisząc:\n` +
  `  "❌ Nie  potrafie kodować, programować ani pisać skryptów."\n\n` +
  `4. ZAKAZY DOTYCZĄCE EXPLOITÓW I MECHANIK BOTA/GRY:\n` +
  `- NIE odpowiadaj na żadne pytania teoretyczne o bugi, nieskończone saldo, omijanie limitów/cooldownów/blacklisty, exploity gier (blackjack, ruletka itp.), przelewanie walut, multi-accounting ani manipulacje komendami.\n\n` +
  `Poza powyższymi zakazami odpowiadaj uprzejmie, zwięźle, konkretnie i po polsku.\n\n`;

function stripPolish(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/gi, 'l')
    .replace(/\u0141/gi, 'l')
    .toLowerCase();
}

function isCodingRequest(question) {
  const norm = stripPolish(question);
  const codingPatterns = [
    /\b(kod|kodu|kodem|kodzie|kodami|kodow)\b/,
    /\b(kodowani[a-z]*|zakodowa[a-z]*|odkodowa[a-z]*)\b/,
    /\b(programowa[a-z]*|zaprogramowa[a-z]*|programist[a-z]*)\b/,
    /\b(skrypt[a-z]*|script[a-z]*)\b/,
    /\b(python|javascript|typescript|c\+\+|c#|java|html|css|php|sql|bash|powershell|rust|golang|ruby|kotlin|swift)\b/,
    /\b(algorytm[a-z]*|funkcj[a-z]*\s+w\s+(kodzie|jezyku|pythonie|js|c))\b/,
    /\b(frontend|backend|framework|react|vue|angular|node\.?js|django|flask)\b/,
    /\bsposob[a-z]*\s+na\s+(kodowani|programowani|napisani|tworzeni|zakodowani)/,
    /\bjak\s+(napisac|zrobic|stworzyc|zakodowac|zaprogramowac)\s+.*(kod|skrypt|program|aplikacj|bota|stron[a-z]*|funkcj|gr[a-z]*)/
  ];
  return codingPatterns.some(p => p.test(norm));
}

function isIdentityOrAiQuery(question) {
  const norm = stripPolish(question);
  const identityPatterns = [
    /\b(czy\s+jestes)\s+(ai|sztuczn[a-z]+\s+inteligencj[a-z]+|modelem|botem|robotem|programem|maszyn[a-z]+|czlowiekiem|gemini|gpt)\b/,
    /\b(jakim|jakie|jaki)\s+.*(ai|modelem|modelu|modele|sztuczn[a-z]+\s+inteligencj[a-z]+)\b/,
    /\b(kto|co)\s+(cie|ciebie)\s+(stworzyl|zaprogramowal|zbudowal|napisal|wytrenowal)\b/,
    /\b(czym|kim)\s+jestes\b/,
    /\bjestes\s+(ai|botem|czlowiekiem|programem|maszyna)\b/,
    /\b(jakim\s+jestes\s+ai|jaki\s+to\s+model|jakie\s+jestes\s+ai)\b/
  ];
  return identityPatterns.some(p => p.test(norm));
}

function sanitizeAiResponse(text) {
  if (!text) return text;
  let s = String(text);

  // 1. Blokada bloków kodu
  if (/```[\s\S]*?```/.test(s)) {
    const withoutCode = s.replace(/```[\s\S]*?```/g, '').trim();
    if (withoutCode.length < 50) {
      return '❌ Nie  potrafie kodować, programować ani pisać skryptów.';
    }
    s = s.replace(/```[\s\S]*?```/g, '\n[Zawartość kodu zablokowana: zakaz generowania kodu]\n');
  }

  // 2. Blokada tagów kodowych
  s = s.replace(/<code>[\s\S]*?<\/code>/gi, '');

  // 3. Usuwanie/zastępowanie fraz AI / modelu (nigdy nie mówi że jest AI ani jakim jest AI)
  s = s.replace(/\b(jako\s+(duzy|duży)?\s*(model\s+jezykowy|model\s+językowy|model\s+ai|model|sztuczna\s+inteligencja|ai|chatbot|bot))\b/gi, 'jako asystent');
  s = s.replace(/\b(jestem\s+(duzym|dużym)?\s*(modelem\s+jezykowym|modelem\s+językowym|modelem\s+ai|modelem|sztuczna\s+inteligencja|sztuczną\s+inteligencją|ai|chatbotem|botem))\b/gi, 'jestem asystentem');
  s = s.replace(/\b(stworzonym|wyszkolonym|stworzony|wyszkolony)\s+przez\s+(google|openai|anthropic|deepmind|meta)\b/gi, 'pomagającym na czacie');
  s = s.replace(/\b(modelu\s+gemini|model\s+gemini|gemini|chatgpt|gpt-4o?|gpt-3\.5|claude|llama)\b/gi, 'asystent');
  s = s.replace(/\b(sztucznej\s+inteligencji|sztuczna\s+inteligencja|sztuczna\s+inteligencje|sztuczną\s+inteligencją)\b/gi, 'asystenta');

  return s;
}

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
  const maxLimit = (isWhitelisted || (config.admins && config.admins.includes(userId))) ? 100000 : 7500;

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

  // Sprawdzenie bonusu z Koła Fortuny (+2 pytania na 24h)
  let hasFortunaBonus = false;
  await withData(store => {
    const u = store.users && store.users[userId];
    if (u && u.analizaBonusUntil && u.analizaBonusUntil > now) {
      hasFortunaBonus = true;
    }
  });
  if (hasFortunaBonus) {
    dailyLimit += 2;
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
  if (isCodingRequest(pendingAi.question)) {
    await safeReply(message, '❌ Nie  potrafie kodować, programować ani pisać skryptów.');
    return;
  }
  if (isIdentityOrAiQuery(pendingAi.question)) {
    await safeReply(message, 'jestem prostym programem opartym na analizie czatu oraz odpowiadaniu na pytania do których odpowiedzi są dostępne na google');
    return;
  }

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

    let replyText = await askGeminiWithFallback(promptText);
    replyText = sanitizeAiResponse(replyText);

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

    if (isCodingRequest(question)) {
      await safeReply(message, '❌ Nie  potrafie kodować, programować ani pisać skryptów.');
      return;
    }

    if (isIdentityOrAiQuery(question)) {
      await safeReply(message, 'jestem prostym programem opartym na analizie czatu oraz odpowiadaniu na pytania do których odpowiedzi są dostępne na google');
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

    const fetchCount = firstArgNum || 200;

    if (!limitCheck.unlimited && fetchCount > limitCheck.maxLimit) {
      await safeReply(message, `❌ Limit wiadomości dla analizy wynosi **${limitCheck.maxLimit}**. Wybrałeś **${fetchCount}**.`);
      return;
    }
    const analysisStartTime = Date.now();
    const fetchHeartbeat = createHeartbeat(message, () => {
      const elapsed = ((Date.now() - analysisStartTime) / 1000).toFixed(0);
      return `⏳ Analiza trwa już **${elapsed}s** — nadal pobieram historię wiadomości...`;
    });
    fetchHeartbeat.start();

    let chunkHeartbeat = null;
    let summaryHeartbeat = null;

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
        chunkHeartbeat = createHeartbeat(message, () => {
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
        summaryHeartbeat = createHeartbeat(message, () => {
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

      finalReplyText = sanitizeAiResponse(finalReplyText);
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
      if (fetchHeartbeat) fetchHeartbeat.stop();
      if (chunkHeartbeat) chunkHeartbeat.stop();
      if (summaryHeartbeat) summaryHeartbeat.stop();
    }
  }
};

module.exports.askGeminiWithFallback = askGeminiWithFallback;
module.exports.handleConfirmedGoogleQuery = handleConfirmedGoogleQuery;
module.exports.checkAiLimits = checkAiLimits;
module.exports.consumeAiQuota = consumeAiQuota;
module.exports.getActiveAnalysesCount = getActiveAnalysesCount;
module.exports.MAX_CONCURRENT_ANALYSES = MAX_CONCURRENT_ANALYSES;
module.exports.isCodingRequest = isCodingRequest;
module.exports.isIdentityOrAiQuery = isIdentityOrAiQuery;
module.exports.sanitizeAiResponse = sanitizeAiResponse;


