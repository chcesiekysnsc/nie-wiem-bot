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
        console.warn(`[STRESC] getThreadHistory timed out for thread ${threadID}`);
        resolve([]);
      }
    }, 12000); // 12 seconds safety timeout

    api.getThreadHistory(threadID, amount, timestamp, (err, history) => {
      clearTimeout(timeout);
      if (completed) return;
      completed = true;
      if (err) {
        console.error('[STRESC] getThreadHistory error:', err);
        return resolve([]);
      }
      resolve(history || []);
    });
  });
}

module.exports = {
  name: 'stresc',
  aliases: ['skrot', 'podsumuj', 'summarize'],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;
    if (!threadId || threadId === message.author.id) {
      await message.reply('❌ Ta komenda może być używana tylko w konwersacjach grupowych.');
      return;
    }

    if (!client.api) {
      await message.reply('❌ Brak połączenia z API Messengera.');
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
      await message.reply(
        '❌ Brak skonfigurowanego klucza Gemini API!\n\n' +
        'Aby komenda działała, dodaj zmienną środowiskową **GEMINI_API_KEY** w panelu Railway.'
      );
      return;
    }

    const statusMsg = await message.reply('🔍 Pobieranie ostatnich 200 wiadomości z czatu...');

    try {
      const history = await getThreadHistoryPage(client.api, threadId, 200, null);
      if (!history || history.length === 0) {
        await message.reply('❌ Nie udało się pobrać historii wiadomości lub historia jest pusta.');
        return;
      }

      // Sformatuj historię rozmów
      const transcriptLines = [];
      const botId = client.api.getCurrentUserID();

      // Utwórz mapę unikalnych autorów w historii
      const senderIds = [...new Set(history.map(msg => msg.senderID).filter(Boolean))];
      const nameMap = {};

      // Najpierw wypełnij z cache
      const unresolvedIds = [];
      for (const senderId of senderIds) {
        if (client.userNames && client.userNames.has(senderId)) {
          nameMap[senderId] = client.userNames.get(senderId);
        } else {
          unresolvedIds.push(senderId);
        }
      }

      // Pobierz brakujące nazwy z API Facebooka
      if (unresolvedIds.length > 0 && client.api && typeof client.api.getUserInfo === 'function') {
        try {
          const userInfoResult = await new Promise((resolve) => {
            client.api.getUserInfo(unresolvedIds, (err, res) => {
              if (err) {
                console.error('[STRESC] getUserInfo error:', err);
                return resolve({});
              }
              resolve(res || {});
            });
          });
          for (const uid of unresolvedIds) {
            if (userInfoResult[uid] && userInfoResult[uid].name) {
              nameMap[uid] = userInfoResult[uid].name;
              // Zapisz do cache na przyszłość
              if (client.userNames) client.userNames.set(uid, userInfoResult[uid].name);
            } else {
              nameMap[uid] = `Użytkownik_${uid.slice(-6)}`;
            }
          }
        } catch (e) {
          console.error('[STRESC] getUserInfo exception:', e);
          for (const uid of unresolvedIds) {
            nameMap[uid] = `Użytkownik_${uid.slice(-6)}`;
          }
        }
      } else {
        for (const uid of unresolvedIds) {
          nameMap[uid] = `Użytkownik_${uid.slice(-6)}`;
        }
      }

      for (const msg of history) {
        if (!msg.body || typeof msg.body !== 'string') continue;
        
        const bodyTrimmed = msg.body.trim();
        if (!bodyTrimmed) continue;

        // Pomiń komendy botów (zaczynające się od prefiksu configu lub !)
        const prefix = '!';
        if (bodyTrimmed.startsWith(prefix)) continue;

        // Pomiń własne wiadomości bota, żeby nie streszczał sam siebie
        if (msg.senderID === botId) continue;

        const senderName = nameMap[msg.senderID] || `Użytkownik_${msg.senderID.slice(-6)}`;
        transcriptLines.push(`${senderName}: ${bodyTrimmed}`);
      }

      if (transcriptLines.length === 0) {
        await message.reply('❌ Nie znaleziono żadnych wiadomości tekstowych do streszczenia (same komendy lub załączniki).');
        return;
      }

      const transcriptText = transcriptLines.join('\n');

      const promptText = 
        `Jesteś neutralnym i szczerym asystentem. ` +
        `Streść poniższą rozmowę z Messengera po polsku.\n\n` +
        `ZASADY:\n` +
        `- Wypisz TYLKO główne wątki/tematy rozmowy w kilku krótkich punktach z emotkami.\n` +
        `- Przy każdym wątku wymień kto brał w nim udział.\n` +
        `- Bądź maksymalnie zwięzły — każdy punkt to 1-2 zdania, nie więcej.\n` +
        `- Na końcu dodaj jedno zdanie neutralnego podsumowania.\n` +
        `- Nie bądź zabawny, nie komentuj, nie zajmuj stanowiska. Tylko fakty.\n` +
        `- Całe streszczenie powinno mieć MAKSYMALNIE 10-15 linijek.\n\n` +
        `Rozmowa:\n` +
        `${transcriptText}\n`;

      // Wyślij zapytanie do API Gemini 2.5 Flash
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          contents: [
            {
              parts: [
                {
                  text: promptText
                }
              ]
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 20000
        }
      );

      const replyText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!replyText) {
        throw new Error('Pusta odpowiedź z API Gemini.');
      }

      const finalResponse = `📝 **Streszczenie ostatnich wiadomości na grupie**:\n\n${replyText}`;
      await message.reply(finalResponse);

    } catch (err) {
      console.error('[STRESC] Błąd podczas generowania streszczenia:', err);
      let errorMsg = '❌ Wystąpił błąd podczas generowania streszczenia.';
      if (err.response && err.response.data && err.response.data.error) {
        errorMsg += ` Szczegóły: ${err.response.data.error.message}`;
      } else {
        errorMsg += ` Szczegóły: ${err.message}`;
      }
      await message.reply(errorMsg);
    }
  }
};
