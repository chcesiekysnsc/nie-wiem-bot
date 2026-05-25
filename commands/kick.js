const config = require('../config/config');

module.exports = {
  name: 'kick',
  aliases: ['wyrzuc'],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;
    if (!threadId) {
      await message.reply('❌ Ta komenda może być używana tylko w konwersacjach grupowych.');
      return;
    }

    if (!client.api) {
      await message.reply('❌ Brak połączenia z API Messengera.');
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
      await message.reply('❌ Podaj ID lub oznacz osobę do wyrzucenia: **!kick @osoba** lub **!kick <id>**');
      return;
    }

    if (targetId === message.author.id) {
      await message.reply('❌ Nie możesz wyrzucić samego siebie.');
      return;
    }

    if (targetId === '100060812419294') {
      await message.reply('❌ Nie możesz wyrzucić twórcy bota!');
      return;
    }

    // Pobierz informacje o grupie i administratorach
    try {
      const info = await new Promise((resolve, reject) => {
        client.api.getThreadInfo(threadId, (err, ret) => {
          if (err) return reject(err);
          resolve(ret);
        });
      });

      if (!info) {
        await message.reply('❌ Błąd podczas pobierania informacji o grupie.');
        return;
      }

      // Wyciągamy ID adminów grupowych
      const adminIDs = (info.adminIDs || []).map(admin => {
        if (typeof admin === 'object' && admin !== null) {
          return admin.id || admin.userID;
        }
        return admin;
      }).filter(Boolean);

      const botId = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : '';

      // Sprawdź czy bot jest adminem
      const isBotAdmin = adminIDs.includes(botId);
      if (!isBotAdmin) {
        await message.reply('❌ Bot nie jest administratorem tej grupy i nie może wyrzucać członków.');
        return;
      }

      // Sprawdź czy nadawca jest adminem grupy lub adminem bota
      const isSenderAdmin = adminIDs.includes(message.author.id) || config.admins.includes(message.author.id);
      if (!isSenderAdmin) {
        await message.reply('❌ Tylko administratorzy grupy lub bota mogą używać tej komendy.');
        return;
      }

      // Wykonaj usunięcie użytkownika
      await new Promise((resolve, reject) => {
        client.api.removeUserFromGroup(targetId, threadId, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      await message.reply(`👋 Usunięto użytkownika **${targetName}** z grupy.`);

    } catch (err) {
      console.error('[KICK] Błąd podczas wyrzucania z grupy:', err);
      await message.reply('❌ Błąd podczas usuwania użytkownika. Upewnij się, że bot ma uprawnienia administratora na tej grupie.');
    }
  }
};
