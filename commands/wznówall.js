const config = require('../config/config');

module.exports = {
  name: 'wznówall',
  aliases: ['unmaintenance', 'koniec_prac', 'wznów'],
  async execute(client, message, args) {
    const senderId = message.author.id;
    if (senderId !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    client.maintenanceMode = false;
    await message.reply('✅ **Wyłączono tryb konserwacyjny.** Bot jest znowu dostępny dla wszystkich.');
  }
};
