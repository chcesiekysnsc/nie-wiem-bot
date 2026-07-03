module.exports = {
  name: 'losuj',
  aliases: ['random', 'wylosuj'],
  async execute(client, message) {
    const threadId = message.threadID;

    if (!threadId || message.isGroup === false) {
      await message.reply('❌ Ta komenda działa tylko na grupach!');
      return;
    }

    try {
      // Pobierz listę uczestników grupy
      let participantIDs = [];
      try {
        participantIDs = await new Promise((resolve, reject) => {
          client.api.getThreadInfo(threadId, (err, info) => {
            if (err) return reject(err);
            if (info && info.participantIDs) {
              resolve(info.participantIDs);
            } else {
              resolve([]);
            }
          });
        });
      } catch (_) {}

      // Fallback — użyj danych z bazy
      if (!participantIDs || participantIDs.length === 0) {
        const { loadData } = require('../utils/storage');
        const usersData = loadData('users') || {};
        participantIDs = Object.entries(usersData)
          .filter(([id, u]) => u.groupMessages && u.groupMessages[threadId])
          .map(([id]) => id);
      }

      const botId = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : '';
      const eligible = participantIDs.filter(id => id !== botId);

      if (eligible.length === 0) {
        await message.reply('❌ Brak osób na grupie do wylosowania.');
        return;
      }

      const winnerId = eligible[Math.floor(Math.random() * eligible.length)];
      const winnerName = await client.resolveUserName(winnerId);

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
