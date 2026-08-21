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
      client.pendingPoradnikCategory = client.pendingPoradnikCategory || new Map();
      const senderId = message.author.id;
      const threadId = message.threadID;

      const existing = client.pendingPoradnikCategory.get(senderId);
      if (existing) clearTimeout(existing.timeout);

      const timeout = setTimeout(() => {
        client.pendingPoradnikCategory.delete(senderId);
      }, 60000);

      client.pendingPoradnikCategory.set(senderId, { timeout, prefix, threadId });

      await message.reply({ embeds: [buildPoradnikCategoriesEmbed(prefix)] });
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
      return;
    }

    await message.reply('❌ Nieprawidłowy numer kategorii. Wpisz !poradnik aby zobaczyć dostępne kategorie.');
  }
};
