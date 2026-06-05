const config = require('../config/config');

function getSeededRandom(seedStr) {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  let seed = Math.abs(hash);
  return function() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

module.exports = {
  name: 'swataj',
  aliases: ['matchmaker', 'pare-dnia', 'couple'],
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

    try {
      // 1. Pobierz uczestników grupy
      let participantIDs = [];
      try {
        participantIDs = await new Promise((resolve, reject) => {
          client.api.getThreadInfo(threadId, (err, info) => {
            if (err) return reject(err);
            if (info && info.participantIDs) {
              resolve(info.participantIDs);
            } else {
              resolve([]);
            }
          });
        });
      } catch (err) {
        console.warn('[SWATAJ] getThreadInfo failed, using database fallback:', err.message);
      }

      // 2. Fallback: Jeśli getThreadInfo nie zadziałało, pobierz z bazy danych aktywnych na tej grupie
      if (!participantIDs || participantIDs.length === 0) {
        const { loadData } = require('../utils/storage');
        const usersData = loadData('users') || {};
        participantIDs = Object.entries(usersData)
          .filter(([id, u]) => u.groupMessages && u.groupMessages[threadId])
          .map(([id]) => id);
      }

      const botId = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : '';
      const eligible = participantIDs.filter(id => id !== botId);

      if (eligible.length < 2) {
        await message.reply('❌ Potrzeba co najmniej 2 zarejestrowanych osób w grupie, aby kogoś wyswatać!');
        return;
      }

      // 3. Stwórz stabilny seed dla dzisiejszego dnia i tej grupy
      // Używamy strefy czasowej Europe/Warsaw
      const dateStr = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
      const seedStr = `${dateStr}-${threadId}`;
      const rand = getSeededRandom(seedStr);

      // 4. Losuj parę dnia
      const idx1 = Math.floor(rand() * eligible.length);
      let idx2 = Math.floor(rand() * eligible.length);
      
      if (idx1 === idx2) {
        idx2 = (idx1 + 1) % eligible.length;
      }

      const user1 = eligible[idx1];
      const user2 = eligible[idx2];

      const name1 = await client.resolveUserName(user1);
      const name2 = await client.resolveUserName(user2);

      // Deterministyczny procent miłości dla tej pary dnia
      const combined = [user1, user2].sort().join('-');
      let loveHash = 0;
      for (let i = 0; i < combined.length; i++) {
        loveHash = (loveHash << 5) - loveHash + combined.charCodeAt(i);
        loveHash |= 0;
      }
      const percentage = Math.abs(loveHash) % 101;

      const response = 
        `💞 **PARA DNIA (${dateStr})** 💞\n\n` +
        `Gwiazdy przemówiły! W tym wątku dzisiejszą parą dnia zostają:\n` +
        `👉 **${name1}** & **${name2}** 👩‍❤️‍👨\n\n` +
        `📈 Ich szansa na udany związek wynosi: **${percentage}%**\n` +
        `*Wpisz !milosc, aby zobaczyć szczegółową przepowiednię.*`;

      await message.reply(response);

    } catch (err) {
      console.error('[SWATAJ] Błąd:', err);
      await message.reply('❌ Wystąpił nieoczekiwany błąd podczas dobierania pary dnia.');
    }
  }
};
