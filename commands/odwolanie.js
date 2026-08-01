const { withData } = require('../utils/storage');
const { askGeminiWithFallback } = require('./ai');

const ADMIN_GROUP_ID = '5277347745703557';
const MAX_LENGTH = 2000;

module.exports = {
  name: 'odwolanie',
  aliases: ['odwołanie'],
  async execute(client, message, args) {
    const userId = message.author.id;

    if (args.length === 0) {
      await message.reply(
        '❌ Użycie: !odwolanie <treść>\n\n' +
        'Napisz poważne wyjaśnienie dlaczego twój ban za automatyczne używanie !work powinien zostać odwołany. Unikaj żartów — zgłoszenia są moderowane automatycznie.'
      );
      return;
    }

    const content = args.join(' ').trim();

    if (content.length > MAX_LENGTH) {
      await message.reply(`❌ Odwołanie jest zbyt długie (maks. ${MAX_LENGTH} znaków).`);
      return;
    }

    const banCheck = await withData(store => {
      store.profiles.workBotBans = store.profiles.workBotBans || {};
      const ban = store.profiles.workBotBans[userId];
      return { hasBan: !!(ban && ban.until > Date.now()) };
    });

    if (!banCheck.hasBan) {
      await message.reply('❌ Nie masz aktywnego bana za automatyczne używanie !work.');
      return;
    }

    const promptText =
      `Jesteś moderatorem odwolania bana za automatyczne używanie komendy !work. Twoim zadaniem jest FAIR, POBŁAŻLIWA ocena, czy poniższa wiadomość to poważne odwolanie bana.\n\n` +
      `✅ ZEZWALAJ NA:\n` +
      `- Wyjaśnienia dlaczego to nie jest bot (np. "gram naturalnie", "mam losowe opóźnienia", "dzisiaj miałem więcej czasu na grę")\n` +
      `- Informacje o swoich godzinach gry i normalnej aktywności (betowanie, pisanie, granie w różne minigry, rozmowy)\n` +
      `- Opisy tego co robiłeś w międzyczasie (!bet, !chickenroad, !blackjack, !daily, !crime, rozmowy, itp.)\n` +
      `- Uznanie błędu z obietnicą zmian\n` +
      `- Poważne próby wyjaśnienia nawet jeśli nie są idealnie sformułowane\n\n` +
      `❌ ODRZUCĄJ TYLKO (odpowiedz NIE):\n` +
      `- Oczywiste żarty, memy, śmieszne historie, ironiczne komentarze\n` +
      `- Pojedyncze słowa, emoji, losowe ciągi znaków, bezsensowne ciągi\n` +
      `- Obraźliwe treści, wulgaryzmy, spam, reklamy\n` +
      `- Zapytania o to, czy ban się skończy, czy ktoś sprawdzi\n` +
      `- Totalnie nie związane z odwołaniem treści\n\n` +
      `Odpowiedz WYŁĄCZNIE w tym formacie, dokładnie dwie linie, bez żadnego dodatkowego tekstu:\n` +
      `TAK albo NIE (jedno słowo w pierwszej linii)\n` +
      `Krótkie uzasadnienie po polsku w jednej linii\n\n` +
      `TREŚĆ ODWOŁANIA DO OCENY:\n"${content}"`;

    let aiResponse;
    try {
      aiResponse = await askGeminiWithFallback(promptText);
    } catch (err) {
      console.error('[ODWOLANIE] Błąd Gemini:', err);
      await message.reply('❌ Wystąpił błąd podczas analizy odwolania, spróbuj ponownie za chwilę.');
      return;
    }

    const firstLine = String(aiResponse || '').trim().split('\n')[0].trim().toUpperCase();
    const isApproved = firstLine.startsWith('TAK');
    const isRejected = firstLine.startsWith('NIE');

    if (!isApproved && !isRejected) {
      console.error('[ODWOLANIE] Nieprawidłowy format odpowiedzi AI:', aiResponse);
      await message.reply('❌ Wystąpił błąd podczas analizy odwolania, spróbuj ponownie za chwilę.');
      return;
    }

    if (isApproved) {
      const authorName = client.userNames && client.userNames.get(userId) ? client.userNames.get(userId) : `Użytkownik_${userId.slice(-6)}`;

      const appealNum = await withData(store => {
        store.profiles.workBotAppeals = store.profiles.workBotAppeals || [];
        const num = store.profiles.workBotAppeals.length + 1;

        const newAppeal = {
          num,
          userId,
          authorName,
          content,
          threadId: message.rawEvent.threadID,
          messageId: message.rawEvent.messageID,
          timestamp: Date.now(),
          status: 'pending'
        };

        store.profiles.workBotAppeals.push(newAppeal);
        return num;
      });

      if (client.api && typeof client.api.sendMessage === 'function') {
        const adminMsg = `🚨 **ODWOŁANIE BANA #${appealNum}**\n👤 Zgłosił: ${authorName} (ID: ${userId})\n\n${content}\n\n💡 Aby odwołać ban, wpisz: !odwolaj ${appealNum} <treść>`;
        client.api.sendMessage(adminMsg, ADMIN_GROUP_ID, (err) => {
          if (err) {
            console.error('[ODWOLANIE] Błąd wysyłania na grupę administracyjną:', err);
          }
        });
      }

      await message.reply(`✅ Twoje odwolanie (numer #${appealNum}) zostało przesłane do administracji.`);
      return;
    }

    await message.reply(
      `⚠️ Twoje odwolanie nie wygląda na poważne. Komenda !odwolanie służy do poważnych prób odwołania bana za automatyczne używanie !work — nie do żartów.`
    );
  }
};
