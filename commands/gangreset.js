const config = require('../config/config');
const { withData } = require('../utils/storage');

module.exports = {
  name: 'gangreset',
  aliases: [],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    await withData(store => {
      store.profiles.gangs = store.profiles.gangs || {};
      for (const gangId of Object.keys(store.profiles.gangs)) {
        store.profiles.gangs[gangId].lastHeistTime = 0;
        store.profiles.gangs[gangId].lastAttackTime = 0;
        store.profiles.gangs[gangId].lastSupportTime = 0;
      }
    });

    await message.reply('✅ Pomyślnie zresetowano cooldowny skoków, ataków i wsparcia dla wszystkich gangów!');
  }
};
