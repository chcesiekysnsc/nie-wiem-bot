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
  `- Nigdy nie mów i nie przyznawaj się, że jesteś sztuczną inteligencją, modelem AI, chatbotem lub programem — unikaj sformułowań takich jak "jestem AI", "jestem modelem", "jako AI" itp.\n` +
  `- Poza tymi zasadami, odpowiadaj normalnie, pomocnie i po polsku.\n\n`;

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
                await message.reply(`❌ Wykorzystałeś już limit **${limitCheck.limit} użyć** komendy !analiza na dobę. Kolejne użycie będzie dostępne za **${remainingStr}**.`);
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
        await message.reply(`❌ Możesz użyć komendy !analiza tylko **raz na dobę**. Kolejne użycie będzie dostępne za **${remainingStr}**.`);
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
          await message.reply(`❌ Ktoś inny użył już !analiza na tej grupie w ciągu ostatnich 10 minut. Spróbuj ponownie za **${remainingStr}**.`);
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
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota oraz uprawnionych osób.');
      return;
    }

    if (args.length === 0) {
      await message.reply(
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
      await message.reply('❌ Musisz zadać pytanie! Np: !analiza 500 kto ma rację w dyskusji o...');
      return;
    }

    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) {
      await message.reply('❌ Brak skonfigurowanego klucza Gemini API!');
      return;
    }

    const useChatContext = msgCount !== null;

    if (!useChatContext) {
      await message.reply('📊 Analizuję pytanie...');

      try {
        const promptText =
          AI_SYSTEM_RULES +
          `Jesteś pomocnym asystentem. Odpowiadaj po polsku, jasno i konkretnie.\n\n` +
          `PYTANIE: ${question}`;

        const replyText = await askGeminiWithFallback(promptText);
        await message.reply(`📊 **Odpowiedź:**\n\n${replyText}`);
      } catch (err) {
        console.error('[AI] Błąd:', err);
        let errorMsg = '❌ Wystąpił błąd podczas generowania odpowiedzi.';
        if (err.response?.data?.error) {
          errorMsg += ` Szczegóły: ${err.response.data.error.message}`;
        } else {
          errorMsg += ` Szczegóły: ${err.message}`;
        }
        await message.reply(errorMsg);
      }
      return;
    }

    if (!threadId) {
      await message.reply('❌ Nie można określić ID konwersacji.');
      return;
    }

    if (!client.api) {
      await message.reply('❌ Brak połączenia z API Messengera.');
      return;
    }

    const fetchCount = msgCount || 200;
    await message.reply(`📥 Pobieram ${fetchCount} wiadomości i analizuję...`);

    try {
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
          await message.reply(`⏳ Pobrano i przeanalizowano już **${totalFetched}** z **${fetchCount}** wiadomości...`);
          lastProgressSentTime = Date.now();
        }
      }

      if (history.length === 0) {
        await message.reply('❌ Nie udało się pobrać historii wiadomości.');
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

      if (transcriptLines.length === 0) {
        await message.reply('❌ Nie znaleziono żadnych wiadomości tekstowych do analizy.');
        return;
      }

      const chunks = splitTranscriptIntoChunks(transcriptLines);
      const apiKeysForChunks = getApiKeys();

      if (apiKeysForChunks.length === 0) {
        await message.reply('❌ Brak skonfigurowanego klucza Gemini API!');
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

        finalReplyText = await askGeminiWithFallback(promptText);
      } else {
        await message.reply(`🧩 Historia jest zbyt długa na jedno zapytanie — dzielę na **${chunks.length}** części i analizuję równolegle...`);

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
          await message.reply('❌ Nie udało się przeanalizować żadnej z części rozmowy. Spróbuj ponownie za chwilę.');
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

        finalReplyText = await askGeminiWithFallback(finalPrompt);

        if (failedCount > 0) {
          finalReplyText += `\n\n⚠️ *Uwaga: ${failedCount} z ${chunks.length} części rozmowy nie udało się przeanalizować z powodu błędów API — odpowiedź może być niepełna.*`;
        }
      }

      await message.reply(`📊 **Odpowiedź** (na podstawie ${transcriptLines.length} wiadomości, ${chunks.length} ${chunks.length === 1 ? 'zapytanie' : 'części'}):\n\n${finalReplyText}`);
    } catch (err) {
      console.error('[AI] Błąd:', err);
      let errorMsg = '❌ Wystąpił błąd podczas analizy.';
      if (err.response?.data?.error) {
        errorMsg += ` Szczegóły: ${err.response.data.error.message}`;
      } else {
        errorMsg += ` Szczegóły: ${err.message}`;
      }
      await message.reply(errorMsg);
    }
  }
};

module.exports.askGeminiWithFallback = askGeminiWithFallback;
