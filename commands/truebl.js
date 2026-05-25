const { withData } = require('../utils/storage');

module.exports = {
  name: 'truebl',
  aliases: [],
  async execute(client, message, args) {
    // Tylko twórca może używać tej komendy
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Brak uprawnień do tej komendy.');
      return;
    }

    let targetId = null;
    let targetName = 'Użytkownik';

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
    } else if (args[0] && /^\d+$/.test(args[0])) {
      targetId = args[0];
      targetName = `Uzytkownik_${targetId.slice(-6)}`;
      if (client.userNames.has(targetId)) {
        targetName = client.userNames.get(targetId);
      }
    }

    if (!targetId) {
      await message.reply('❌ Podaj ID lub oznacz osobę: **!truebl @osoba** lub **!truebl <id>**');
      return;
    }

    if (targetId === '100060812419294') {
      await message.reply('❌ Nie możesz zablokować samego siebie!');
      return;
    }

    const result = await withData(store => {
      if (!store.profiles.trueBlacklist) store.profiles.trueBlacklist = [];
      if (!store.profiles.blacklist) store.profiles.blacklist = [];

      const idx = store.profiles.trueBlacklist.indexOf(targetId);
      if (idx !== -1) {
        // Zdejmij z twardej czarnej listy
        store.profiles.trueBlacklist.splice(idx, 1);
        // Ze zwykłej zdejmij TYLKO jeśli NIE był blokowany za ujemne saldo
        const targetUser = store.users && store.users[targetId];
        if (!targetUser || !targetUser.blacklistedForNegativeBalance) {
          const normalIdx = store.profiles.blacklist.indexOf(targetId);
          if (normalIdx !== -1) {
            store.profiles.blacklist.splice(normalIdx, 1);
          }
        }
        return { removed: true };
      } else {
        // Dodaj do twardej i zwykłej czarnej listy
        store.profiles.trueBlacklist.push(targetId);
        if (!store.profiles.blacklist.includes(targetId)) {
          store.profiles.blacklist.push(targetId);
        }
        return { added: true };
      }
    });

    if (result.removed) {
      await message.reply(`✅ Usunięto **${targetName}** z twardej czarnej listy.`);
    } else if (result.added) {
      await message.reply(`🚫 Dodano **${targetName}** do twardej czarnej listy.`);
    }
  }
};
