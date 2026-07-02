const config = require('../config/config');
const { withData } = require('../utils/storage');

module.exports = {
  name: 'gangreset',
  aliases: [],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Nie masz uprawnień do użycia tej komendy.');
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
