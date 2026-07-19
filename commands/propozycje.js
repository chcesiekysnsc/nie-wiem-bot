const { withData } = require('../utils/storage');
const { askGeminiWithFallback } = require('./ai');

const ADMIN_GROUP_ID = '5277347745703557';
const MAX_LENGTH = 2000;
const MAX_WARNINGS = 3;

module.exports = {
  name: 'propozycje',
  aliases: ['propozycja'],
  async execute(client, message, args) {
    const userId = message.author.id;

    if (args.length === 0) {
      await message.reply(
        '❌ Użycie: !propozycje <treść>\n\n' +
        'Opisz swój pomysł na nową komendę, przedmiot, funkcję lub inny sensowny sugerowany rozwój bota. Unikaj żartów — zgłoszenia są moderowane automatycznie.'
      );
      return;
    }

    const content = args.join(' ').trim();

    if (content.length > MAX_LENGTH) {
      await message.reply(`❌ Zgłoszenie jest zbyt długie (maks. ${MAX_LENGTH} znaków).`);
      return;
    }

    const banCheck = await withData(store => {
      store.profiles.proposalModeration = store.profiles.proposalModeration || {};
      const entry = store.profiles.proposalModeration[userId];
      return { banned: !!(entry && entry.banned) };
    });

    if (banCheck.banned) {
      await message.reply('🚫 Zostałeś zablokowany na używanie komendy !propozycje po otrzymaniu 3 ostrzeżeń za niepoważne zgłoszenia.');
      return;
    }

    const promptText =
      `Jesteś bardzo surowym moderatorem zgłoszeń w grze/bocie na Messengerze. Twoim zadaniem jest ABSOLUTNIE STRICT ocena, czy poniższa wiadomość to POWAŻNA, UŻYTECZNA propozycja dla bota.\n\n` +
      `✅ ZEZWALAJ TYLKO NA:\n` +
      `- Konkretne pomysły na NOWE KOMENDY (z opisem działania i przykładem użycia)\n` +
      `- Propozycje NOWYCH PRZEDMIOTÓW w sklepie (z nazwą, ceną, efektem)\n` +
      `- Propozycje NOWYCH FUNKCJI lub ULEPSZEŃ istniejących mechanik (z opisem zmiany i korzyści)\n` +
      `- Konkretne ZGŁOSZENIA BŁĘDÓW lub PROBLEMÓW (z opisem co nie działa i jak to reprodukować)\n` +
      `- Innowacje, które realnie pomogą botowi lub ulepszą doświadczenie graczy\n\n` +
      `❌ ODRZUCĄJ BEZWZGLĘDNIE (odpowiedz NIE):\n` +
      `- Wszystkie żarty, memy, śmieszne historie, ironiczne komentarze\n` +
      `- Pojedyncze słowa, emoji, losowe ciągi znaków, bezsensowne ciągi\n` +
      `- Zapytania o to, czy coś działa, czy bot jest online, czy ktoś tu jest\n` +
      `- Obraźliwe treści, wulgaryzmy, spam, reklamy\n` +
      `- Wszystko co NIE jest konkretną propozycją poprawy/ulepszenia bota\n\n` +
      `Odpowiedz WYŁĄCZNIE w tym formacie, dokładnie dwie linie, bez żadnego dodatkowego tekstu:\n` +
      `TAK albo NIE (jedno słowo w pierwszej linii)\n` +
      `Krótkie uzasadnienie po polsku w jednej linii\n\n` +
      `TREŚĆ ZGŁOSZENIA DO OCENY:\n"${content}"`;

    let aiResponse;
    try {
      aiResponse = await askGeminiWithFallback(promptText);
    } catch (err) {
      console.error('[PROPOZYCJE] Błąd Gemini:', err);
      await message.reply('❌ Wystąpił błąd podczas analizy zgłoszenia, spróbuj ponownie za chwilę.');
      return;
    }

    const firstLine = String(aiResponse || '').trim().split('\n')[0].trim().toUpperCase();
    const isApproved = firstLine.startsWith('TAK');
    const isRejected = firstLine.startsWith('NIE');

    if (!isApproved && !isRejected) {
      console.error('[PROPOZYCJE] Nieprawidłowy format odpowiedzi AI:', aiResponse);
      await message.reply('❌ Wystąpił błąd podczas analizy zgłoszenia, spróbuj ponownie za chwilę.');
      return;
    }

    if (isApproved) {
      let authorName = `Użytkownik_${userId.slice(-6)}`;
      if (client.userNames && client.userNames.has(userId)) {
        authorName = client.userNames.get(userId);
      }

      const proposalNum = await withData(store => {
        store.profiles.proposals = store.profiles.proposals || [];
        const num = store.profiles.proposals.length + 1;

        const newProposal = {
          num,
          userId,
          authorName,
          content,
          threadId: message.rawEvent.threadID,
          messageId: message.rawEvent.messageID,
          timestamp: Date.now()
        };

        store.profiles.proposals.push(newProposal);
        return num;
      });

      if (client.api && typeof client.api.sendMessage === 'function') {
        const adminMsg = `💡 **PROPOZYCJA #${proposalNum}**\n👤 Zgłosił: ${authorName} (ID: ${userId})\n\n${content}\n\n💡 Aby odpowiedzieć, wpisz: !odpowiedz ${proposalNum} <treść>`;
        client.api.sendMessage(adminMsg, ADMIN_GROUP_ID, (err) => {
          if (err) {
            console.error('[PROPOZYCJE] Błąd wysyłania na grupę administracyjną:', err);
          }
        });
      }

      await message.reply(`✅ Dziękujemy za zgłoszenie! Twoja propozycja (Numer: **#${proposalNum}**) została przesłana do administracji.`);
      return;
    }

    // isRejected
    const warnResult = await withData(store => {
      store.profiles.proposalModeration = store.profiles.proposalModeration || {};
      const entry = store.profiles.proposalModeration[userId] || { warnings: 0, banned: false };
      entry.warnings = (entry.warnings || 0) + 1;

      if (entry.warnings >= MAX_WARNINGS) {
        entry.banned = true;
      }

      store.profiles.proposalModeration[userId] = entry;
      return { warnings: entry.warnings, banned: entry.banned };
    });

    if (warnResult.banned) {
      await message.reply('🚫 To Twoje 3. ostrzeżenie za niepoważne zgłoszenie — od teraz masz zablokowaną komendę !propozycje.');
    } else {
      await message.reply(
        `⚠️ Twoje zgłoszenie nie wygląda na poważną propozycję. Komenda !propozycje służy do zgłaszania realnych pomysłów na komendy, przedmioty lub funkcje — nie do żartów. To ostrzeżenie **${warnResult.warnings}/3**. Po 3 ostrzeżeniach stracisz dostęp do tej komendy.`
      );
    }
  }
};
