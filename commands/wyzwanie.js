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
  'Zrób zdjęcie swojego kciuka uniesionego w górę na tle ekranu z tą konwersacją. 👍',
  
  // Nowe wyzwania od użytkownika
  'Wyślij zdjęcie swoich stóp. 👣',
  'Wyślij zdjęcie ze śmieszną miną. 😜',
  'Wyślij ostatnie zdjęcie z galerii. 📸',
  'Narysuj kota z zamkniętymi oczami i wyślij zdjęcie. 🐱🎨',
  'Wyślij zdjęcie pierwszej rzeczy po swojej lewej stronie. 👈',
  'Wyślij zdjęcie swoich butów. 👟',
  'Napisz do swojego ex „co tam?” i wyślij dowód (screenshot). 💬',
  'Wyślij wiadomość do losowej osoby z kontaktów: „Mam ważne pytanie” i pokaż screenshot. 📱',
  'Zmień zdjęcie profilowe na zdjęcie osoby wyzywającej Cię na 5 minut. 🖼️',
  'Pokaż historię wyszukiwania Google zaczynającą się od „por”. 🔍',
  'Wyślij swoje najstarsze selfie. 🤳',
  'Pokaż najdziwniejsze zdjęcie, jakie masz w galerii. 👾',
  'Napisz do byłej/byłego „śniłeś/aś mi się” i pokaż odpowiedź. 😴',
  'Wyślij nagranie głosowe, w którym śpiewasz dowolną piosenkę przez 15 sekund. 🎤'
];

const truths = [
  'Powiedz, jaka była ostatnia rzecz, którą kupiłeś. 💸',
  'Napisz imię swojej pierwszej sympatii. ❤️',
  'Powiedz, jaki był Twój największy przypał. 🤦',
  'Napisz, ile godzin spałeś ostatniej nocy. 🛌',
  'Powiedz, jaki jest najdziwniejszy sen, który pamiętasz. 💭',
  'Napisz, której aplikacji używasz najczęściej. 📱',
  'Powiedz jedną rzecz, której większość osób o Tobie nie wie. 🤫',
  'Napisz, kto z ludzi na grupie zrobił na Tobie najlepsze pierwsze wrażenie. 🌟',
  'Napisz, kto z ludzi na grupie zrobił na Tobie najgorsze pierwsze wrażenie. 💀',
  'Powiedz, jaki był Twój największy błąd. 📉',
  'Kto jest najbardziej irytujący na grupie? 😠',
  'Powiedz, jaka jest najbardziej wstydliwa rzecz, którą zrobiłeś po alkoholu. 🍻',
  'Powiedz, jaki był Twój największy przypał związany z płcią przeciwną. 👩‍❤️‍👨',
  'Powiedz, jaka była największa głupota, za którą zapłaciłeś. 💰',
  'Opowiedz o sytuacji, której najbardziej się wstydzisz. 🫣',
  'Powiedz, z kim z grupy najchętniej utknąłbyś na bezludnej wyspie i dlaczego. 🏝️',
  'Powiedz jedną opinię, której boisz się mówić publicznie. 🙊',
  'Powiedz, jaka była najdziwniejsza plotka na Twój temat. 🗣️',
  'Powiedz, jaka była największa kara, jaką dostałeś w życiu. ⛔',
  'Powiedz, jaka była najgorsza rzecz, jaką zrobiłeś w szkole. 🏫',
  'Jaka jest rzecz o Tobie, której większość ludzi by się nie spodziewała? 🔮',
  'Czego najbardziej w sobie nie lubisz? 🌪️',
  'Jaka była Twoja najgorsza decyzja w ostatnim roku? ❌',
  'Co zrobiłeś w przeszłości, czego dziś się wstydzisz? ⏳',
  'Jaka jest Twoja największa porażka i czego Cię nauczyła? 🎓',
  'Kiedy ostatnio skłamałeś i dlaczego? 🤥',
  'Jaka jest rzecz, którą udajesz przed innymi? 🎭',
  'Czego najbardziej się boisz? 😨',
  'Co jest Twoją największą słabością? 📉',
  'Jaka była najtrudniejsza rozmowa, jaką prowadziłeś? 🗣️',
  'Co w Twoim życiu najbardziej byś zmienił, gdybyś mógł cofnąć czas? 🔄',
  'Jaka jest rzecz, którą ukrywasz przed większością znajomych? 🔒',
  'Kiedy ostatnio zrobiłeś coś, czego żałujesz? 💔',
  'Co najdziwniejszego o Tobie ktoś kiedyś powiedział i… mógł mieć rację? 🤔',
  'Jaka jest Twoja najbardziej kontrowersyjna opinia? 🌶️',
  'Czego nigdy nikomu nie powiedziałeś, a często o tym myślisz? 💭',
  'Kiedy ostatnio zrobiłeś coś tylko dlatego, że chciałeś komuś zaimponować? 😎',
  'Co jest Twoją największą niepewnością? 🩹',
  'Jaką cechę u siebie najczęściej ukrywasz? 🕵️',
  'Jaka była najgorsza rzecz, jaką powiedziałeś w złości? 🤬',
  'Co najbardziej w Tobie irytuje innych ludzi (Twoim zdaniem)? ⚡',
  'Co jest Twoją najgorszą cechą w relacjach? 💔',
  'Co robisz, gdy nikt nie patrzy, a raczej byś się do tego nie przyznał? 🤫',
  'Co jest Twoim największym nawykiem, którego nie potrafisz kontrolować? 🔄',
  'Jaka była Twoja najbardziej toksyczna relacja i dlaczego? ☣️',
  'Co jest prawdą o Tobie, której inni mogą nie chcieć usłyszeć? 📣',
  'Napisz największą głupotę, jaką zrobiłeś w szkole. 🏫'
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
        const { loadData } = require('../utils/storage');
        const usersData = loadData('users') || {};
        let participantIDs = Object.entries(usersData)
          .filter(([id, u]) => u.groupMessages && u.groupMessages[threadId])
          .map(([id]) => id);

        const botId = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : '';
        const eligible = participantIDs.filter(id => id !== botId && id !== message.author.id);

        if (eligible.length === 0) {
          await message.reply('❌ Brak innych osób na grupie, które można wyzwać.');
          return;
        }

        targetId = eligible[Math.floor(Math.random() * eligible.length)];
        targetName = await client.resolveUserName(targetId);
      }

      // Losujemy 50/50 między Prawdą a Wyzwaniem
      const isTruth = Math.random() < 0.5;
      
      let challengeMsg = '';
      let targetTask = '';
      
      if (isTruth) {
        targetTask = truths[Math.floor(Math.random() * truths.length)];
        challengeMsg = 
          `❓ **PRAWDA!** ❓\n\n` +
          `Użytkownik **@${targetName}** zostaje wyzwany do odpowiedzi! 🫵\n` +
          `Twoje pytanie to:\n` +
          `👉 **${targetTask}**\n\n` +
          `⏰ Masz dokładnie **3 minuty (180 sekund)** na udzielenie szczerej odpowiedzi tutaj na czacie!`;
      } else {
        targetTask = challenges[Math.floor(Math.random() * challenges.length)];
        challengeMsg = 
          `⚡ **WYZWANIE RZECZYWISTE!** ⚡\n\n` +
          `Użytkownik **@${targetName}** zostaje wyzwany do tablicy! 🫵\n` +
          `Twoje zadanie to:\n` +
          `👉 **${targetTask}**\n\n` +
          `⏰ Masz dokładnie **3 minuty (180 sekund)** na wrzucenie dowodu wykonania zadania tutaj na czat! Odliczanie rozpoczęte!`;
      }

      await message.reply(challengeMsg);

      const typeLabel = isTruth ? 'udzielenie szczerej odpowiedzi' : 'wykonanie wyzwania';
      const proofLabel = isTruth ? 'udzieliłeś/aś odpowiedzi' : 'wrzuciłeś/aś dowód';
      const reactLabel = isTruth ? 'pod Twoją odpowiedzią' : 'pod Twoim dowodem';

      // Uruchom 3-minutowy timer
      setTimeout(async () => {
        const followUpMsg = 
          `⌛ **MINĘŁY 3 MINUTY!** ⌛\n\n` +
          `@${targetName}, Twój czas na ${typeLabel} minął!\n` +
          `Czy ${proofLabel} na czat? Uczestnicy grupy decydują o zaliczeniu zadania za pomocą reakcji ${reactLabel}! 👍/👎`;
        
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
