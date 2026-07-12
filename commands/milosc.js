const config = require('../config/config');

module.exports = {
  name: 'milosc',
  aliases: ['love', 'kalkulatormilosci'],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;
    
    let user1 = null;
    let user2 = null;

    const mentionedIds = message.mentionedIds || [];
    
    if (mentionedIds.length >= 2) {
      user1 = mentionedIds[0];
      user2 = mentionedIds[1];
    } else if (mentionedIds.length === 1) {
      user1 = message.author.id;
      user2 = mentionedIds[0];
    } else {
      await message.reply('❌ Oznacz osobę, z którą chcesz sprawdzić dopasowanie, np.: **!milosc @osoba** lub dwie osoby: **!milosc @osoba1 @osoba2**');
      return;
    }

    if (user1 === user2) {
      await message.reply(' narcissist? 🧐 Kochać samego siebie to piękna sprawa, ale kalkulator potrzebuje dwóch różnych osób!');
      return;
    }

    const name1 = await client.resolveUserName(user1);
    const name2 = await client.resolveUserName(user2);

    // Deterministyczny generator procentowy oparty na ID użytkowników
    const combined = [user1, user2].sort().join('-');
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      hash = (hash << 5) - hash + combined.charCodeAt(i);
      hash |= 0;
    }
    const percentage = Math.abs(hash) % 101;

    const specialPair = ['61573228601016', '61563456404665'];
    const isSpecialPair = specialPair.includes(user1) && specialPair.includes(user2);

    let description = '';
    let heartEmoji = '💔';

    if (isSpecialPair) {
      heartEmoji = '❤️‍🔥';
      description = 'Prawdziwa, niezniszczalna miłość. Musicie wziąć ślub i strzelić 2 dzieciaki.';
    } else if (percentage <= 20) {
      heartEmoji = '💔';
      const descriptions = [
        'Totalna katastrofa. Nawet wasze koty syczałyby na siebie na samą myśl o waszej relacji.',
        'Związek z lodówką ma większe szanse na przetrwanie. Lepiej zostańcie przy "cześć" na korytarzu.',
        'Chemia między wami przypomina wodę z olejem. Po prostu się nie klei.'
      ];
      description = descriptions[Math.abs(hash) % descriptions.length];
    } else if (percentage <= 40) {
      heartEmoji = '❤️‍🩹';
      const descriptions = [
        'Szału nie ma. Może i się dogadacie, pod warunkiem że nikt nic nie powie przez całe życie.',
        'Przeciętna znajomość. Istnieje 30% szans, że zapomnisz o tej osobie po zmianie pracy.',
        'Mogłoby być gorzej, ale na ślub i wesele raczej nie zbierajcie.'
      ];
      description = descriptions[Math.abs(hash) % descriptions.length];
    } else if (percentage <= 60) {
      heartEmoji = '💛';
      const descriptions = [
        'Typowe stabilne małżeństwo. Razem głównie ze względu na wspólny kredyt hipoteczny i dzieci.',
        'Klimat jest przyjazny. Może wyjść z tego dobra przyjaźń z okazjonalnym wyjściem na piwo.',
        'Pomiędzy przyjaźnią a czymś więcej. Złoty środek, ale bez fajerwerków.'
      ];
      description = descriptions[Math.abs(hash) % descriptions.length];
    } else if (percentage <= 80) {
      heartEmoji = '🧡';
      const descriptions = [
        'Jest chemia! Czas pomyśleć o poważniejszej randce – kebab na cienkim to idealny początek.',
        'Iskrzy aż miło! Wasza przyszłość wygląda ciepło, chociaż kłótnie o to, kto zmywa naczynia, będą legendarne.',
        'Bardzo dobre dopasowanie. Wzajemne zrozumienie i wspólne żarty z innych ludzi gwarantowane.'
      ];
      description = descriptions[Math.abs(hash) % descriptions.length];
    } else if (percentage <= 99) {
      heartEmoji = '❤️';
      const descriptions = [
        'Bratnie dusze! Ślub wisi w powietrzu. Zacznijcie już pisać zaproszenia dla całej grupy!',
        'Idealne dopasowanie! Rozmawiacie bez słów, a wasza miłość przetrwa nawet awarię internetu.',
        'Oboje nadajecie na tych samych falach. Bot daje wam oficjalne błogosławieństwo.'
      ];
      description = descriptions[Math.abs(hash) % descriptions.length];
    } else {
      heartEmoji = '💖💖💖';
      description = 'ABSOLUTNA HARMONIA! Bogowie miłości płaczą ze wzruszenia. Jesteście dla siebie stworzeni, wasze dopasowanie to legendarne 100%!';
    }

    const response = 
      `💓 **KALKULATOR MIŁOŚCI** 💓\n\n` +
      `👩‍❤️‍👨 **${name1}**  &  **${name2}**\n` +
      `📈 Dopasowanie: **${isSpecialPair ? '101' : percentage}%** ${heartEmoji}\n\n` +
      `🔮 **Przepowiednia:** *${description}*`;

    await message.reply(response);
  }
};
