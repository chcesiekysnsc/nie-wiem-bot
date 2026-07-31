const { withData } = require('../utils/storage');

const OWNER_ID = '100060812419294';

module.exports = {
  name: 'anuluj',
  aliases: [],
  async execute(client, message, args) {
    if (message.author.id !== OWNER_ID) {
      await message.reply('❌ Tylko twórca bota może anulować ban za automatyczne używanie !work.');
      return;
    }

    const num = parseInt(args[0], 10);

    if (isNaN(num)) {
      await message.reply('❌ Użycie: !anuluj <nr odwolania>');
      return;
    }

    const appeal = await withData(store => {
      const list = store.profiles.workBotAppeals || [];
      return list.find(a => a.num === num);
    });

    if (!appeal) {
      await message.reply(`❌ Nie znaleziono odwolania o numerze **#${num}**.`);
      return;
    }

    await withData(store => {
      store.profiles.workBotBans = store.profiles.workBotBans || {};
      if (store.profiles.workBotBans[appeal.userId]) {
        delete store.profiles.workBotBans[appeal.userId];
      }

      const list = store.profiles.workBotAppeals || [];
      const entry = list.find(a => a.num === num);
      if (entry) {
        entry.status = 'accepted';
        entry.acceptedAt = Date.now();
      }
    });

    await message.reply(`✅ Ban za automatyczne używanie !work został anulowany dla użytkownika z odwolania #${num}.`);
  }
};
