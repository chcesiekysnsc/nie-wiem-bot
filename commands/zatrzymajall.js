const config = require('../config/config');

function safeSend(api, content, threadID) {
  return new Promise((resolve) => {
    let completed = false;
    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.warn('[ZATRZYMAJALL] safeSend timed out');
        resolve(false);
      }
    }, 10000);

    api.sendMessage(content, threadID, (err) => {
      clearTimeout(timeout);
      if (completed) return;
      completed = true;
      if (err) {
        console.error('[ZATRZYMAJALL] safeSend error:', err);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

module.exports = {
  name: 'zatrzymajall',
  aliases: ['maintenance', 'prace', 'konserwacja'],
  async execute(client, message, args) {
    const senderId = message.author.id;
    if (senderId !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    client.maintenanceMode = true;
    const threadId = message.threadID;
    await safeSend(client.api, '🔧 **Włączono tryb konserwacyjny.** Wszystkie komendy dla użytkowników zostały zablokowane.', threadId);
  }
};
