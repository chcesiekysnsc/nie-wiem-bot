const axios = require('axios');
const fs = require('fs');
const path = require('path');

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

function getApiKey() {
  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    try {
      const aiConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'config_ai.json'), 'utf8'));
      apiKey = aiConfig.GEMINI_API_KEY;
    } catch (_) {}
  }
  return apiKey;
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

module.exports = {
  name: 'ai',
  aliases: ['pytanie', 'zapytaj'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const threadId = message.guild?.id || message.rawEvent?.threadID;

    if (args.length === 0) {
      await message.reply(
        '❌ Użycie: !ai [liczba wiadomości] <pytanie>\n\n' +
        'Przykłady:\n' +
        '• !ai jaka jest stolica Francji?\n' +
        '• !ai wyjaśnij czym jest inflacja\n' +
        '• !ai kto jest najaktywniejszy?\n' +
        '• !ai 500 przeanalizuj kto ma rację w sporze'
      );
      return;
    }

    let msgCount = null;
    let question = '';

    const firstArgNum = parseInt(args[0], 10);
    if (!isNaN(firstArgNum) && firstArgNum > 0) {
      msgCount = Math.min(firstArgNum, 40000);
      question = args.slice(1).join(' ').trim();
    } else {
      question = args.join(' ').trim();
    }

    if (!question) {
      await message.reply('❌ Musisz zadać pytanie! Np: !ai 500 kto ma rację w dyskusji o...');
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      await message.reply('❌ Brak skonfigurowanego klucza Gemini API!');
      return;
    }

    const useChatContext = msgCount !== null || needsChatContext(question);

    if (!useChatContext) {
      await message.reply('🤖 Analizuję pytanie...');

      try {
        const promptText =
          `Jesteś pomocnym asystentem AI. Odpowiadaj po polsku, jasno i konkretnie.\n\n` +
          `PYTANIE: ${question}`;

        const replyText = await askGemini(apiKey, promptText);
        await message.reply(`🤖 **Odpowiedź AI:**\n\n${replyText}`);
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
    await message.reply(`🤖 Pobieram ${fetchCount} wiadomości i analizuję...`);

    try {
      const history = await getThreadHistoryPage(client.api, threadId, fetchCount, null);
      if (!history || history.length === 0) {
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

      const promptText =
        `Jesteś inteligentnym asystentem analizującym rozmowę z Messengera. ` +
        `Odpowiadaj po polsku, szczerze i konkretnie.\n\n` +
        `PYTANIE UŻYTKOWNIKA: ${question}\n\n` +
        `Przeanalizuj poniższą historię rozmowy (${transcriptLines.length} wiadomości) i odpowiedz na pytanie.\n` +
        `Bądź szczery, konkretny i oparty na faktach z rozmowy. Używaj imion uczestników.\n\n` +
        `Rozmowa:\n` +
        `${transcriptLines.join('\n')}\n`;

      const replyText = await askGemini(apiKey, promptText);
      await message.reply(`🤖 **Odpowiedź AI** (na podstawie ${transcriptLines.length} wiadomości):\n\n${replyText}`);
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
