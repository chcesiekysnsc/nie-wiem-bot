const config = require('../config/config');
const { ensureInventoryRecord, addItem } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const ARTEFAKTY_MAP = {
  1: { id: 'krwawy_zeton', name: 'Krwawy Żeton', emoji: '🩸' },
  2: { id: 'przekupiony_krupier', name: 'Przekupiony Krupier', emoji: '🧠' },
  3: { id: 'zlota_karta', name: 'Złota Karta', emoji: '💳' },
  4: { id: 'stary_zegar', name: 'Stary Zegar', emoji: '⏰' },
  5: { id: 'kamera', name: 'Kamera', emoji: '📷' }
};

module.exports = {
  name: 'itemadd',
  aliases: ['additem'],
  async execute(client, message, args) {
    const authorId = message.author.id;

    // Sprawdź czy to admin
    const isAdmin = config.admins.includes(authorId);
    if (!isAdmin) {
      await message.reply('❌ Nie masz uprawnień do korzystania z tej komendy.');
      return;
    }

    const artNum = parseInt(args[0], 10);
    const art = ARTEFAKTY_MAP[artNum];

    if (!art) {
      await message.reply('❌ Użyj: **!itemadd <nr_artefaktu (1-5)>**\n1. Krwawy Żeton\n2. Przekupiony Krupier\n3. Złota Karta\n4. Stary Zegar\n5. Kamera');
      return;
    }

    await withData(store => {
      const inv = ensureInventoryRecord(store.inventory, authorId);
      addItem(inv, art.id, 1);
    });

    await message.reply(`🎁 Pomyślnie dodałeś artefakt **${art.emoji} ${art.name}** do swojego ekwipunku!`);
  }
};
