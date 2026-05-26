const config = require('../config/config');
const { refreshBadges, ensureInventoryRecord } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'lvlset',
  aliases: [],
  async execute(client, message, args) {
    // Sprawdź czy to twórca bota
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Brak uprawnień do tej komendy.');
      return;
    }

    const targetLvl = parseInt(args[0], 10);
    if (isNaN(targetLvl) || targetLvl < 1 || targetLvl > 100) {
      await message.reply('❌ Podaj poprawny poziom (1-100): **!lvlset <poziom>**');
      return;
    }

    await withData(store => {
      const user = createUser(message.author.id, store.users);
      user.level = targetLvl;
      user.xp = 0; // resetuj xp na nowym poziomie
      
      const inv = ensureInventoryRecord(store.inventory, message.author.id);
      refreshBadges(user, inv);
    });

    await message.reply(`✅ Ustawiono Twój poziom na **${targetLvl}** (XP zresetowane do 0).`);
  }
};
