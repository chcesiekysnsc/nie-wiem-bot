module.exports = {
  name: 'losuj',
  aliases: ['random', 'wylosuj'],
  async execute(client, message) {
    const threadId = message.threadID || message.rawEvent?.threadID;
    const isGroup = message.isGroup !== undefined ? message.isGroup : (message.rawEvent?.isGroup || (threadId && threadId !== message.author?.id));

    if (!threadId || isGroup === false) {
      await message.reply('❌ Ta komenda działa tylko na grupach!');
      return;
    }

    try {
      // Pobierz listę uczestników grupy z bazy danych
      const { loadData } = require('../utils/storage');
      const usersData = loadData('users') || {};
      let participantIDs = Object.entries(usersData)
        .filter(([id, u]) => u.groupMessages && u.groupMessages[threadId])
        .map(([id]) => id);

      const botId = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : '';
      const eligible = participantIDs.filter(id => id !== botId);

      if (eligible.length === 0) {
        await message.reply('❌ Brak osób na grupie do wylosowania.');
        return;
      }

      const winnerId = eligible[Math.floor(Math.random() * eligible.length)];
      const winnerName = await client.resolveUserName(client.api, winnerId);

      // Wyślij wiadomość z oznaczeniem wylosowanej osoby
      const msg = `🎲 **Losowanie na grupie!**\n\n🎯 Wylosowana osoba to: **${winnerName}**!`;

      // Oznacz użytkownika za pomocą mentions
      client.api.sendMessage(
        {
          body: msg,
          mentions: [{ tag: winnerName, id: winnerId }]
        },
        threadId
      );
    } catch (err) {
      console.error('[LOSUJ] Error:', err);
      await message.reply('❌ Wystąpił błąd podczas losowania.');
    }
  }
};
