const {
  buildPoradnikCategoriesEmbed,
  buildPoradnikListEmbed,
  buildPoradnikDetailEmbed,
  resolvePoradnikCategory,
  getPoradnikByCategoryAndNumber
} = require('../utils/poradnikSystem');

module.exports = {
  name: 'poradnik',
  aliases: ['guide'],
  async execute(client, message, args) {
    const prefix = message.prefix || '!';

    // !poradnik bez argumentów -> pytanie o kategorię, czeka na odpowiedź nadawcy
    if (!args.length) {
      if (!client.activePoradnikSession) client.activePoradnikSession = new Map();
      const threadId = message.threadID;
      const existingSession = client.activePoradnikSession.get(threadId);

      if (existingSession && existingSession.userId !== message.author.id) {
        await message.reply('❌ Jest już aktywna sesja poradnika na tej grupie. Poczekaj aż się zakończy.');
        return;
      }

      if (existingSession) {
        clearTimeout(existingSession.timeout);
        client.activePoradnikSession.delete(threadId);
      }

      const timeout = setTimeout(() => {
        client.activePoradnikSession.delete(threadId);
      }, 60000);

      client.activePoradnikSession.set(threadId, { userId: message.author.id, timeout, prefix: message.prefix || '!' });

      await message.reply({ embeds: [buildPoradnikCategoriesEmbed(message.prefix || '!')] });
      return;
    }

    const firstArg = String(args[0] || '').toLowerCase();
    const categoryNum = resolvePoradnikCategory(firstArg);

    // !poradnik <numer kategorii> [numer poradnika]
    if (categoryNum) {
      const secondArg = args[1];
      if (secondArg !== undefined) {
        const poradnikNum = Number(secondArg);
        if (!Number.isInteger(poradnikNum)) {
          await message.reply('❌ Nieprawidłowy numer poradnika. Wpisz numer poradnika który chcesz zobaczyć.');
          return;
        }
        const poradnik = getPoradnikByCategoryAndNumber(categoryNum, poradnikNum);
        if (!poradnik) {
          await message.reply('❌ Nie znaleziono poradnika o tym numerze. Sprawdź listę poradników w tej kategorii.');
          return;
        }
        await message.reply({ embeds: [buildPoradnikDetailEmbed(categoryNum, poradnikNum)] });
        return;
      }

      await message.reply({ embeds: [buildPoradnikListEmbed(categoryNum)] });

      if (!client.activePoradnikSession) client.activePoradnikSession = new Map();
      const existingSession = client.activePoradnikSession.get(message.threadID);
      if (existingSession) clearTimeout(existingSession.timeout);
      const timeout = setTimeout(() => {
        client.activePoradnikSession.delete(message.threadID);
      }, 60000);
      client.activePoradnikSession.set(message.threadID, { userId: message.author.id, timeout, prefix: message.prefix || '!', categoryNum });

      return;
    }

    await message.reply('❌ Nieprawidłowy numer kategorii. Wpisz !poradnik aby zobaczyć dostępne kategorie.');
  }
};
