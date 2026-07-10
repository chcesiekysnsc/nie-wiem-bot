const { withData } = require('../utils/storage');
const { askGeminiWithFallback } = require('./ai');

const ADMIN_GROUP_ID = '5277347745703557';

module.exports = {
  name: 'propozycje',
  aliases: ['propozycja'],
  async execute(client, message, args) {
    const senderId = message.author.id;

    if (args.length === 0) {
      await message.reply(
        '❌ Użycie: !propozycje <treść>\n\n' +
        'Opisz swój pomysł na nową komendę, przedmiot, funkcję lub inny sensowny sugerowany rozwój bota. Unikaj żartów — zgłoszenia są moderowane przez AI.'
      );
      return;
    }

    const content = args.join(' ');
    if (content.length > 2000) {
      await message.reply('❌ Zgłoszenie jest zbyt długie (maks. 2000 znaków).');
      return;
    }

    let mod = { warnings: 0, banned: false };
    await withData(store => {
      store.profiles.proposalModeration = store.profiles.proposalModeration || {};
      const entry = store.profiles.proposalModeration[senderId];
      if (entry) {
        mod.warnings = entry.warnings || 0;
        mod.banned = !!entry.banned;
      }
    });

    if (mod.banned) {
      await message.reply('🚫 Zostałeś zablokowany na używanie komendy !propozycje po otrzymaniu 3 ostrzeżeń za niepoważne zgłoszenia.');
      return;
    }

    const promptText =
      'Jesteś moderatorem zgłoszeń w grze/bocie na Messengerze. Twoim zadaniem jest ocenić, czy poniższa wiadomość to SENSOWNA propozycja — np. pomysł na nową komendę, nowy przedmiot w sklepie, nową funkcję, ulepszenie istniejącej mechaniki, lub konkretne zgłoszenie problemu/błędu — czy jest to żart, spam, wulgaryzm, przypadkowy ciąg znaków, obraźliwy tekst lub coś niepoważnego (np. "!gowno", "xd", "działa dobrze lol", pojedyncze emoji).\n\n' +
      'Odpowiedz WYŁĄCZNIE w tym formacie, dokładnie dwie linie, bez żadnego dodatkowego tekstu:\n' +
      'TAK albo NIE (jedno słowo w pierwszej linii)\n' +
      'Krótkie uzasadnienie po polsku w jednej linii\n\n' +
      `TREŚĆ ZGŁOSZENIA DO OCENY:\n"${String(content).slice(0, 2000)}"`;

    let replyText;
    try {
      replyText = await askGeminiWithFallback(promptText);
    } catch (err) {
      await message.reply('❌ Wystąpił błąd podczas analizy zgłoszenia, spróbuj ponownie za chwilę.');
      return;
    }

    const lines = String(replyText).split('\n');
    const firstLine = (lines[0] || '').trim().toUpperCase();

    if (!firstLine.startsWith('TAK') && !firstLine.startsWith('NIE')) {
      await message.reply('❌ Wystąpił błąd podczas analizy zgłoszenia, spróbuj ponownie za chwilę.');
      return;
    }

    const authorName = (client.userNames && client.userNames.get(senderId)) || `Użytkownik_${senderId.slice(-6)}`;

    if (firstLine.startsWith('TAK')) {
      const adminMsg = `👤 Zgłosił: ${authorName} (ID: ${senderId})\n\n!propozycja ${content}`;
      client.api.sendMessage(adminMsg, ADMIN_GROUP_ID);
      await message.reply('✅ Dziękujemy za zgłoszenie! Twoja propozycja została przesłana do administracji.');
      return;
    }

    await withData(store => {
      store.profiles.proposalModeration = store.profiles.proposalModeration || {};
      store.profiles.proposalModeration[senderId] = store.profiles.proposalModeration[senderId] || { warnings: 0, banned: false };
      store.profiles.proposalModeration[senderId].warnings = (store.profiles.proposalModeration[senderId].warnings || 0) + 1;
      store.profiles.proposalModeration[senderId].banned = store.profiles.proposalModeration[senderId].warnings >= 3;
    });

    let currentWarnings = 0;
    await withData(store => {
      const entry = store.profiles.proposalModeration[senderId];
      if (entry) currentWarnings = entry.warnings || 0;
    });

    if (currentWarnings >= 3) {
      await message.reply('🚫 To Twoje 3. ostrzeżenie za niepoważne zgłoszenie — od teraz masz zablokowaną komendę !propozycje.');
      return;
    }

    await message.reply(`⚠️ Twoje zgłoszenie nie wygląda na poważną propozycję. Komenda !propozycje służy do zgłaszania realnych pomysłów na komendy, przedmioty lub funkcje — nie do żartów. To ostrzeżenie **${currentWarnings}/3**. Po 3 ostrzeżeniach stracisz dostęp do tej komendy.`);
  }
};
