const { withData } = require('../utils/storage');

const OWNER_ID = '100060812419294';

module.exports = {
  name: 'odpowiedz',
  aliases: ['odpowiadaj', 'odp'],
  async execute(client, message, args) {
    if (message.author.id !== OWNER_ID) {
      await message.reply('❌ Tylko twórca bota może odpowiadać na propozycje.');
      return;
    }

    const num = parseInt(args[0], 10);
    const replyText = args.slice(1).join(' ').trim();

    if (isNaN(num) || !replyText) {
      await message.reply('❌ Użycie: !odpowiedz <nr propozycji> <treść odpowiedzi>');
      return;
    }

    const proposal = await withData(store => {
      const list = store.profiles.proposals || [];
      return list.find(p => p.num === num);
    });

    if (!proposal) {
      await message.reply(`❌ Nie znaleziono propozycji o numerze **#${num}**.`);
      return;
    }

    if (client.api && typeof client.api.sendMessage === 'function') {
      const text = `📣 **ODPOWIEDŹ ADMINISTRACJI:**\n\n${replyText}`;
      // Wysłanie wiadomości jako odpowiedź na oryginalną wiadomość propozycji
      client.api.sendMessage(
        text,
        proposal.threadId,
        (err) => {
          if (err) {
            console.error('[ODPOWIEDZ] Błąd wysyłania odpowiedzi:', err);
            message.reply('❌ Wystąpił błąd podczas wysyłania odpowiedzi na czat propozycji.');
          } else {
            message.reply(`✅ Pomyślnie wysłano odpowiedź na propozycję #${num}.`);
          }
        },
        proposal.messageId
      );
    } else {
      await message.reply('❌ Błąd: API bota jest niedostępne.');
    }
  }
};
