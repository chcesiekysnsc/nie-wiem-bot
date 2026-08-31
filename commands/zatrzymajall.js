const config = require('../config/config');

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
    await message.reply('🔧 **Włączono tryb konserwacyjny.** Wszystkie komendy dla użytkowników zostały zablokowane.');
  }
};
