const { withData } = require('../utils/storage');

const OWNER_ID = '100060812419294';

module.exports = {
  name: 'odwolaj',
  aliases: ['odwołaj'],
  async execute(client, message, args) {
    if (message.author.id !== OWNER_ID) {
      await message.reply('❌ Tylko twórca bota może odwoływać banu za automatyczne używanie !work.');
      return;
    }

    const num = parseInt(args[0], 10);
    const replyText = args.slice(1).join(' ').trim();

    if (isNaN(num) || !replyText) {
      await message.reply('❌ Użycie: !odwolaj <nr odwolania> <treść>');
      return;
    }

    const appeal = await withData(store => {
      const list = store.profiles.workBotAppeals || [];
      return list.find(a => a.num === num);
    });

    if (!appeal) {
      await message.reply(`❌ Nie znaleziono odwolania o numerze **#${num}**.`);
      return;
    }

    await withData(store => {
      const list = store.profiles.workBotAppeals || [];
      const entry = list.find(a => a.num === num);
      if (entry) {
        entry.status = 'responded';
        entry.response = replyText;
        entry.respondedAt = Date.now();
      }
    });

    if (client.api && typeof client.api.sendMessage === 'function') {
      const text = `💬 **ODPOWIEDŹ NA ODWOŁANIE #${num}:**\n\n${replyText}`;
      client.api.sendMessage(
        text,
        appeal.threadId,
        (err) => {
          if (err) {
            console.error('[ODWOLAJ] Błąd wysyłania odpowiedzi:', err);
            message.reply('❌ Wystąpił błąd podczas wysyłania odpowiedzi.');
          } else {
            message.reply(`✅ Pomyślnie wysłano odpowiedź na odwolanie #${num}.`);
          }
        },
        appeal.messageId
      );
    } else {
      await message.reply('❌ Błąd: API bota jest niedostępne.');
    }
  }
};
