const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Helper to get thread history as promise with a safety timeout
function getThreadHistoryPage(api, threadID, amount, timestamp) {
  return new Promise((resolve) => {
    let completed = false;
    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.warn(`[AI] getThreadHistory timed out for thread ${threadID}`);
        resolve([]);
      }
    }, 15000);

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

module.exports = {
  name: 'ai',
  aliases: ['pytanie', 'zapytaj'],
  async execute(client, message, args) {
    // Tylko twórca bota
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const threadId = message.guild?.id || message.rawEvent?.threadID;
    if (!threadId) {
      await message.reply('❌ Nie można określić ID konwersacji.');
      return;
    }

    if (!client.api) {
      await message.reply('❌ Brak połączenia z API Messengera.');
      return;
    }

    // Parsuj argumenty: !ai <liczba> <pytanie> lub !ai <pytanie> (domyślnie 200 wiadomości)
    let msgCount = 200;
    let question = '';

    if (args.length === 0) {
      await message.reply('❌ Użycie: !ai [liczba wiadomości] <pytanie>\n\nPrzykłady:\n• !ai kto jest najaktywniejszy?\n• !ai 500 przeanalizuj kto ma rację w sporze\n• !ai 1000 o czym najczęściej rozmawiano?');
      return;
    }

    // Sprawdź czy pierwszy argument to liczba
    const firstArgNum = parseInt(args[0], 10);
    if (!isNaN(firstArgNum) && firstArgNum > 0) {
      msgCount = Math.min(firstArgNum, 1000); // Max 1000 wiadomości
      question = args.slice(1).join(' ').trim();
    } else {
      question = args.join(' ').trim();
    }

    if (!question) {
      await message.reply('❌ Musisz zadać pytanie! Np: !ai 500 kto ma rację w dyskusji o...');
      return;
    }

    // Pobierz klucz API
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      try {
        const aiConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'config_ai.json'), 'utf8'));
        apiKey = aiConfig.GEMINI_API_KEY;
      } catch (_) {}
    }

    if (!apiKey) {
      await message.reply('❌ Brak skonfigurowanego klucza Gemini API!');
      return;
    }

    const statusMsg = await message.reply(`🤖 Pobieram ${msgCount} wiadomości i analizuję...`);

    try {
      const history = await getThreadHistoryPage(client.api, threadId, msgCount, null);
      if (!history || history.length === 0) {
        await message.reply('❌ Nie udało się pobrać historii wiadomości.');
        return;
      }

      // Rozwiąż nazwy użytkowników
      const botId = client.api.getCurrentUserID();
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

      // Pobierz brakujące nazwy z API
      if (unresolvedIds.length > 0 && client.api && typeof client.api.getUserInfo === 'function') {
        try {
          const userInfoResult = await new Promise((resolve) => {
            client.api.getUserInfo(unresolvedIds, (err, res) => {
              if (err) return resolve({});
              resolve(res || {});
            });
          });
          for (const uid of unresolvedIds) {
            if (userInfoResult[uid] && userInfoResult[uid].name) {
              nameMap[uid] = userInfoResult[uid].name;
              if (client.userNames) client.userNames.set(uid, userInfoResult[uid].name);
            } else {
              nameMap[uid] = `Użytkownik_${uid.slice(-6)}`;
            }
          }
        } catch (e) {
          for (const uid of unresolvedIds) {
            nameMap[uid] = `Użytkownik_${uid.slice(-6)}`;
          }
        }
      } else {
        for (const uid of unresolvedIds) {
          nameMap[uid] = `Użytkownik_${uid.slice(-6)}`;
        }
      }

      // Formatuj historię
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

      const transcriptText = transcriptLines.join('\n');

      const promptText =
        `Jesteś inteligentnym asystentem analizującym rozmowę z Messengera. ` +
        `Odpowiadaj po polsku, szczerze i konkretnie.\n\n` +
        `PYTANIE UŻYTKOWNIKA: ${question}\n\n` +
        `Przeanalizuj poniższą historię rozmowy (${transcriptLines.length} wiadomości) i odpowiedz na pytanie.\n` +
        `Bądź szczery, konkretny i oparty na faktach z rozmowy. Używaj imion uczestników.\n\n` +
        `Rozmowa:\n` +
        `${transcriptText}\n`;

      // Wyślij do Gemini
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
          timeout: 30000
        }
      );

      const replyText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!replyText) {
        throw new Error('Pusta odpowiedź z API Gemini.');
      }

      const finalResponse = `🤖 **Odpowiedź AI** (na podstawie ${transcriptLines.length} wiadomości):\n\n${replyText}`;
      await message.reply(finalResponse);

    } catch (err) {
      console.error('[AI] Błąd:', err);
      let errorMsg = '❌ Wystąpił błąd podczas analizy.';
      if (err.response && err.response.data && err.response.data.error) {
        errorMsg += ` Szczegóły: ${err.response.data.error.message}`;
      } else {
        errorMsg += ` Szczegóły: ${err.message}`;
      }
      await message.reply(errorMsg);
    }
  }
};
