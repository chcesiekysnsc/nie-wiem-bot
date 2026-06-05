const config = require('../config/config');

const challenges = [
  'Wyślij zdjęcie swojego lewego buta. 👟',
  'Wyślij zdjęcie swojej prawej dłoni trzymającej widelec lub łyżkę. 🍴',
  'Napisz na czacie zdanie "Jestem tajnym agentem bota" pisząc wyłącznie nosem! 👃',
  'Wyślij zdjęcie najbliższego przedmiotu w kolorze czerwonym. 🔴',
  'Napisz szczery komplement dla osoby, która wywołała to wyzwanie. 💬',
  'Wyślij zdjęcie swojego aktualnego kubka lub szklanki z napojem. ☕',
  'Narysuj na kartce uśmiechniętą buźkę, zrób jej zdjęcie i wyślij na czat. 📝',
  'Wyślij selfie ze śmieszną miną (lub zdjęcie swojego zwierzaka, jeśli wstydzisz się pokazać twarz). 🐶',
  'Napisz krótki, rymowany wierszyk (min. 4 wersy) o osobie, która wywołała to wyzwanie. ✍️',
  'Przez następne 5 minut musisz kończyć każdą swoją wiadomość zwrotem: "...i tak to właśnie jest". 🗣️',
  'Wyślij zdjęcie swoich skarpetek, które masz teraz na sobie. 🧦',
  'Napisz najgorszy i najbardziej suchy żart/suchar jaki znasz. 🍞',
  'Zrób zdjęcie swojej klawiatury lub myszki z bliska. ⌨️',
  'Znajdź w domu dowolną maskotkę, zabawkę lub figurkę i wyślij jej zdjęcie. 🧸',
  'Zrób i wyślij zdjęcie widoku ze swojego najbliższego okna. 🪟',
  'Wymień 3 najfajniejsze cechy osoby, która wyzwała Cię do gry. ✨',
  'Wyślij zdjęcie swojej lodówki (może być zamknięta lub otwarta!). 🧊',
  'Napisz na grupie najdziwniejszą rzecz, jaką ostatnio zjadłeś/aś. 🍕',
  'Wyślij wiadomość głosową (krótkie nagranie) nucąc lub śpiewając refren swojej ulubionej piosenki (wystarczy 5 sekund!). 🎤',
  'Zrób zdjęcie swojego kciuka uniesionego w górę na tle ekranu z tą konwersacją. 👍'
];

module.exports = {
  name: 'wyzwanie',
  aliases: ['dare', 'wyzywam'],
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
      let targetId = null;
      let targetName = '';

      const mentioned = message.mentions.users.first();
      
      if (mentioned) {
        targetId = mentioned.id;
        targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
      } else {
        // Losowy wybór gracza z grupy
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
        } catch (_) {}

        if (!participantIDs || participantIDs.length === 0) {
          const { loadData } = require('../utils/storage');
          const usersData = loadData('users') || {};
          participantIDs = Object.entries(usersData)
            .filter(([id, u]) => u.groupMessages && u.groupMessages[threadId])
            .map(([id]) => id);
        }

        const botId = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : '';
        const eligible = participantIDs.filter(id => id !== botId && id !== message.author.id);

        if (eligible.length === 0) {
          await message.reply('❌ Brak innych osób na grupie, które można wyzwać.');
          return;
        }

        targetId = eligible[Math.floor(Math.random() * eligible.length)];
        targetName = await client.resolveUserName(targetId);
      }

      const dare = challenges[Math.floor(Math.random() * challenges.length)];

      const challengeMsg = 
        `⚡ **WYZWANIE RZECZYWISTE!** ⚡\n\n` +
        `Użytkownik **@${targetName}** zostaje wyzwany do tablicy! 🫵\n` +
        `Twoje zadanie to:\n` +
        `👉 **${dare}**\n\n` +
        `⏰ Masz dokładnie **3 minuty (180 sekund)** na wrzucenie dowodu wykonania zadania tutaj na czat! Odliczanie rozpoczęte!`;

      await message.reply(challengeMsg);

      // Uruchom 3-minutowy timer
      setTimeout(async () => {
        // Sprawdź czy grupa wciąż istnieje/gra trwa
        const followUpMsg = 
          `⌛ **MINĘŁY 3 MINUTY!** ⌛\n\n` +
          `@${targetName}, Twój czas na wykonanie wyzwania minął!\n` +
          `Czy wrzuciłeś/aś dowód na czat? Uczestnicy grupy decydują o zaliczeniu zadania za pomocą reakcji pod Twoim dowodem! 👍/👎`;
        
        try {
          await client.api.sendMessage(followUpMsg, threadId);
        } catch (e) {
          console.error('[WYZWANIE] Failed to send follow-up message:', e.message);
        }
      }, 3 * 60 * 1000);

    } catch (err) {
      console.error('[WYZWANIE] Błąd:', err);
      await message.reply('❌ Wystąpił nieoczekiwany błąd podczas losowania wyzwania.');
    }
  }
};
