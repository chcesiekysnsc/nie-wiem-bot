const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const { withData } = require('../utils/storage');
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
    }, 240000);

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
    const aiConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'config_ai.json'), 'utf8'));
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
      timeout: 240000
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
const MAX_CHUNKS = 20; // zabezpieczenie: powyżej tej liczby chunków przerywamy zamiast ryzykować OOM

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

module.exports = {
  name: 'analiza',
  aliases: ['pytanie', 'zapytaj'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    const threadId = message.guild?.id || message.rawEvent?.threadID;
    let isAllowed = message.author.id === creatorId;
    let maxLimit = 10000;
    let skipGroupCooldown = false;

    if (!isAllowed) {
      try {
        const profiles = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'profiles.json'), 'utf8'));
        if (profiles.allowedAI) {
          const allowedEntry = profiles.allowedAI.find(entry => {
            if (typeof entry === 'string') return entry === message.author.id;
            if (typeof entry === 'object' && entry.id) return entry.id === message.author.id;
            return false;
          });

          if (allowedEntry) {
            isAllowed = true;
            skipGroupCooldown = true;

            if (typeof allowedEntry === 'object' && allowedEntry.dailyLimit && message.author.id !== creatorId) {
              const now = Date.now();
              const oneDayMs = 24 * 60 * 60 * 1000;
              const limitCheck = await withData(store => {
                if (!store.cooldowns.commands[message.author.id]) {
                  store.cooldowns.commands[message.author.id] = {};
                }
                const userCooldowns = store.cooldowns.commands[message.author.id];

                if (!Array.isArray(userCooldowns['ai_usages'])) {
                  userCooldowns['ai_usages'] = [];
                }

                userCooldowns['ai_usages'] = userCooldowns['ai_usages'].filter(ts => now - ts < oneDayMs);

                if (userCooldowns['ai_usages'].length >= allowedEntry.dailyLimit) {
                  const oldestUsage = userCooldowns['ai_usages'][0];
                  const remaining = oneDayMs - (now - oldestUsage);
                  return { exceeded: true, remaining, limit: allowedEntry.dailyLimit };
                }

                userCooldowns['ai_usages'].push(now);
                return { exceeded: false };
              });

              if (limitCheck.exceeded) {
                const remainingStr = msToReadable(limitCheck.remaining);
                await safeReply(message, `❌ Wykorzystałeś już limit **${limitCheck.limit} użyć** komendy !analiza na dobę. Kolejne użycie będzie dostępne za **${remainingStr}**.`);
                return;
              }
            }
          }
        }
      } catch (_) {}
    }

    // Zwykli użytkownicy: 1 użycie/dobę + 10 min cooldown grupowy + limit 5000 wiadomości
    if (!isAllowed) {
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const groupCooldownMs = 10 * 60 * 1000;

      const dailyCheck = await withData(store => {
        if (!store.cooldowns.commands[message.author.id]) {
          store.cooldowns.commands[message.author.id] = {};
        }
        const userCooldowns = store.cooldowns.commands[message.author.id];

        if (!Array.isArray(userCooldowns['ai_usages'])) {
          userCooldowns['ai_usages'] = [];
        }

        userCooldowns['ai_usages'] = userCooldowns['ai_usages'].filter(ts => now - ts < oneDayMs);

        if (userCooldowns['ai_usages'].length >= 1) {
          const oldestUsage = userCooldowns['ai_usages'][0];
          const remaining = oneDayMs - (now - oldestUsage);
          return { exceeded: true, remaining };
        }

        return { exceeded: false };
      });

      if (dailyCheck.exceeded) {
        const remainingStr = msToReadable(dailyCheck.remaining);
        await safeReply(message, `❌ Możesz użyć komendy !analiza tylko **raz na dobę**. Kolejne użycie będzie dostępne za **${remainingStr}**.`);
        return;
      }

      if (threadId) {
        const groupCheck = await withData(store => {
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
          await safeReply(message, `❌ Ktoś inny użył już !analiza na tej grupie w ciągu ostatnich 10 minut. Spróbuj ponownie za **${remainingStr}**.`);
          return;
        }
      }

      // Oba limity przeszły — zużyj je i pozwól na wykonanie
      await withData(store => {
        if (!store.cooldowns.commands[message.author.id]) {
          store.cooldowns.commands[message.author.id] = {};
        }
        const userCooldowns = store.cooldowns.commands[message.author.id];
        if (!Array.isArray(userCooldowns['ai_usages'])) {
          userCooldowns['ai_usages'] = [];
        }
        userCooldowns['ai_usages'].push(now);

        if (threadId) {
          store.profiles.aiGroupCooldowns = store.profiles.aiGroupCooldowns || {};
          store.profiles.aiGroupCooldowns[threadId] = now;
        }
      });

      isAllowed = true;
      maxLimit = 5000;
    }

    if (!isAllowed) {
      await safeReply(message, '❌ Ta komenda jest dostępna tylko dla twórcy bota oraz uprawnionych osób.');
      return;
    }

    if (args.length === 0) {
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

    const isAdmin = config.admins.includes(message.author.id);
    if (isAdmin || message.author.id === creatorId || skipGroupCooldown) {
      maxLimit = 100000;
    }

    let msgCount = null;
    let question = '';

    const firstArgNum = parseInt(args[0], 10);
    if (!isNaN(firstArgNum) && firstArgNum > 0) {
      msgCount = Math.min(firstArgNum, maxLimit);
      question = args.slice(1).join(' ').trim();
    } else {
      question = args.join(' ').trim();
    }

    if (!question) {
      await safeReply(message, '❌ Musisz zadać pytanie! Np: !analiza 500 kto ma rację w dyskusji o...');
      return;
    }

    const forbiddenPatterns = [
      /\b(kod|kodzie|kodow|kodu|programow|programowanie|programowania|skrypt|skrypty|skryptu|skryptem)\b/i,
      /\b(bot|api|automat|automation|node\.js|javascript|python|php|c\+\+|java|sql|html|css)\b/i,
      /\b(react|vue|angular|discord|messenger|integracj|middleware|proxy|scraper|parser|curl|wget|postman)\b/i,
      /\b(http|https|request|endpoint|webhook|socket|tcp|udp|port|localhost|server|serwer|hostowanie|hosting)\b/i,
      /\b(deploy|wdrożenie|wdrozyć|repozytori|git|github|gitlab|bitbucket|npm|yarn|pip|composer|gem|cargo)\b/i,
      /\b(maven|gradle|docker|kubernetes|k8s|cloud|chmur|azure|aws|gcp|heroku|vercel|netlify|railway)\b/i,
      /\b(digitalocean|linode|vps|domen|dns|ssl|tls|cert|certificate|oauth|jwt|token|api key|secret|password)\b/i,
      /\b(login|auth|authentic|authoriz|permission|uprawnien|rola|role|admin|administrator|moderator)\b/i,
      /\b(ban|unban|kick|mute|unmute|warn|ostrzeżenie|blokada|zablokuj|odblokuj|whitelist|blacklist)\b/i,
      /\b(filter|filtr|spam|anti spam|rate limit|limit|throttle|backoff|circuit breaker|cache|redis)\b/i,
      /\b(database|baza|mysql|postgres|mongodb|mongo|sqlite|oracle|mariadb|query|zapytanie|insert|update)\b/i,
      /\b(delete|select|join|table|tabela|column|kolumna|row|rekord|record|json|xml|yaml|csv|tsv)\b/i,
      /\b(export|import|backup|restore|migrate|migracja|seed|fixture|fixtura|test|testy|unit test|integration test)\b/i,
      /\b(cypress|jest|mocha|chai|jasmine|karma|webdriver|selenium|puppeteer|playwright|headless|chrome|firefox)\b/i,
      /\b(browser|przeglądark|scrape|scrap|crawl|spider|robot|parser|pars|extract|wyodrębn|transform|transformac)\b/i,
      /\b(etl|pipe|potok|stream|strumień|buffer|bufor|queue|kolejk|rabbitmq|kafka|celery|worker|work)\b/i,
      /\b(job|zadanie|task|zadania|cron|schedule|harmonogram|timer|interval|interwał|timeout|time out)\b/i,
      /\b(retry|ponów|attempt|próba|fallback|failover|ha|high availability|load balancer|balans|proxy)\b/i,
      /\b(gateway|brama|cdn|edge|obrzeże|latency|opóźnien|throughput|przepustowość|bandwidth|pasmo|monitor)\b/i,
      /\b(monitoring|alert|alarm|log|logi|logging|metric|metryk|dashboard|panel|grafana|prometheus|datadog)\b/i,
      /\b(newrelic|sentry|bug|błąd|error|exception|wyjątek|stack trace|trace|debug|debugg|profile|profil)\b/i,
      /\b(performance|wydajność|optimization|optymaliz|cpu|ram|memory|pamięć|disk|dysk|io|network|sieć)\b/i,
      /\b(connect|połączen|disconnect|rozłącz|reconnect|połącz|socket|gniazdo|port|ssh|ftp|sftp|telnet)\b/i,
      /\b(rdp|vnc|teamviewer|anydesk|remote|zdalny|vpn|tunel|tunnel|tor|onion|darknet|deepweb|phishing)\b/i,
      /\b(phish|scam|oszust|fraud|fraudulent|cheat|oszustwo|hack|hak|exploit|eksploit|vulnerability|podatność)\b/i,
      /\b(cve|patch|łatka|security|bezpieczeństwo|encryption|szyfrow|decrypt|deszyfrow|hash|sha|md5|aes|rsa)\b/i,
      /\b(ecc|firewall|zapora|ids|ips|siem|soc|forensic|forenzyczny|incident|incydent|breach|naruszen|leak)\b/i,
      /\b(wyciek|data leak|password leak|credential|poświadczen|authentication|uwierzyteln|authorization|autoryzacj)\b/i,
      /\b(cookie|csrf|xss|sqli|injection|injeksj|rce|remote code|code execution|arbitrary|dowolny|path traversal)\b/i,
      /\b(directory traversal|lfi|rfi|ssrf|xxe|xml external|deserializ|unserializ|pickle|yaml load|eval|exec)\b/i,
      /\b(system|shell_exec|passthru|proc_open|popen|curl|file_get_contents|fopen|fwrite|fread|include)\b/i,
      /\b(require|import|load|zmienna|variable|const|let|var|function|funkcja|class|klasa|object|obiekt)\b/i,
      /\b(array|tablica|string|ciąg|number|liczba|integer|całkowit|float|double|boolean|bool|true|false|null)\b/i,
      /\b(undefined|void|async|await|promise|then|catch|try|throw|error|błąd|exception|wyjątek|return|zwróć)\b/i,
      /\b(if|else|switch|case|for|while|do|break|continue|next|map|filter|reduce|forEach|for of|for in)\b/i,
      /\b(class|extends|super|static|get|set|constructor|destructor|namespace|przestrzeń|nazw|use|import)\b/i,
      /\b(closure|anon|arrow|=>|fun|anonym|callback|callable|invoke|dispatch|event|listener|subscriber)\b/i,
      /\b(observer|emitter|trigger|handler|middleware|pipe|compose|chain|kolejność|stream|buffer|chunk)\b/i,
      /\b(batch|part|fragment|segment|slice|split|divide|podział|merge|połącz|join|concat|union|intersect)\b/i,
      /\b(diff|unique|distinct|group|having|order|sort|limit|offset|paginate|stronicowanie|page|strona)\b/i,
      /\b(size|rozmiar|count|liczba|total|suma|avg|average|średnia|min|max|minimum|maximum|median)\b/i,
      /\b(mode|moda|variance|wariancja|stddev|odchylenie|standard|percentile|kwartyl|decile|detyl)\b/i,
      /\b(quartile|capacity|pojemność|packet|pakiet|frame|ramka|datagram|ipv4|ipv6|grpc|rest|soap)\b/i,
      /\b(xmlrpc|jsonrpc|graphql|gql|websocket|ws:\/\/|wss:\/\/|http:\/\/|https:\/\/|ftp:\/\/|sftp:\/\/|ssh:\/\/)\b/i,
      /\b(git:\/\/|file:\/\/|data:|blob:|about:)\b/i
    ];

    const q = question.toLowerCase();
    const isForbiddenQuestion = forbiddenPatterns.some(pattern => pattern.test(q));

    if (isForbiddenQuestion) {
      await safeReply(message, 'nie wiem');
      return;
    }


    // Tryb bez liczby wiadomości (zwykłe pytanie do AI) jest zarezerwowany dla
    // twórcy bota oraz użytkowników z jawnym pozwoleniem (profiles.allowedAI).
    // Zwykli użytkownicy oraz ci korzystający z limitu 1/dobę mogą używać
    // wyłącznie trybu z analizą historii czatu (!analiza <liczba> <pytanie>).
    const isCreatorOrWhitelisted = message.author.id === creatorId || skipGroupCooldown;
    if (msgCount === null && !isCreatorOrWhitelisted) {
      await safeReply(message,
        '❌ Zwykłe pytania (bez podania liczby wiadomości) są dostępne tylko dla twórcy bota oraz osób z nadanym dostępem.\n\n' +
        'Możesz użyć: **!analiza <liczba wiadomości> <pytanie>**, np. **!analiza 500 przeanalizuj kto ma rację w sporze**.'
      );
      return;
    }

    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) {
      await safeReply(message, '❌ Brak skonfigurowanego klucza Gemini API!');
      return;
    }

    const useChatContext = msgCount !== null;

    if (!useChatContext) {
      await safeReply(message, '📊 Analizuję pytanie...');

      try {
        const promptText =
          AI_SYSTEM_RULES +
          `Jesteś pomocnym asystentem. Odpowiadaj po polsku, jasno i konkretnie.\n\n` +
          `PYTANIE: ${question}`;

        const replyText = await askGeminiWithFallback(promptText);
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
      }
      return;
    }

    if (!threadId) {
      await safeReply(message, '❌ Nie można określić ID konwersacji.');
      return;
    }

    if (!client.api) {
      await safeReply(message, '❌ Brak połączenia z API Messengera.');
      return;
    }

    const fetchCount = msgCount || 200;
    await safeReply(message, `📥 Pobieram ${fetchCount} wiadomości i analizuję...`);

    try {
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

        const partialSummaries = await Promise.all(
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
        finalReplyText = await askGeminiWithFallback(finalPrompt);
        console.log(`[AI] Otrzymano finalną odpowiedź (thread ${threadId})`);

        if (failedCount > 0) {
          finalReplyText += `\n\n⚠️ *Uwaga: ${failedCount} z ${chunks.length} części rozmowy nie udało się przeanalizować z powodu błędów API — odpowiedź może być niepełna.*`;
        }
      }

      await safeReply(message, `📊 **Odpowiedź** (na podstawie ${transcriptLines.length} wiadomości, ${chunks.length} ${chunks.length === 1 ? 'zapytanie' : 'części'}):\n\n${finalReplyText}`);
    } catch (err) {
      console.error('[AI] Błąd:', err);
      let errorMsg = '❌ Wystąpił błąd podczas analizy.';
      if (err.response?.data?.error) {
        errorMsg += ` Szczegóły: ${err.response.data.error.message}`;
      } else {
        errorMsg += ` Szczegóły: ${err.message}`;
      }
      await safeReply(message, errorMsg);
    }
  }
};

module.exports.askGeminiWithFallback = askGeminiWithFallback;
