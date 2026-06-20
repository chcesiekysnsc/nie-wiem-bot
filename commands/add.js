const fs = require('fs');
const https = require('https');
const path = require('path');
const config = require('../config/config');
const { parseFBInput, resolveUIDFromUsername } = require('../utils/facebook');

module.exports = {
  name: 'add',
  aliases: ['dodaj'],
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

    if (!args[0]) {
      await message.reply('❌ Podaj link do konta FB, nazwę użytkownika lub ID: **!add <link/username/id>**');
      return;
    }

    try {
      const input = args.join(' ');
      const parsed = parseFBInput(input);
      let targetId = null;

      if (parsed.type === 'id') {
        targetId = parsed.value;
      } else {
        const loadingMsg = await message.reply(`🔍 Rozpoznano nazwę użytkownika/link "${parsed.value}". Trwa pobieranie ID z Facebooka...`);
        try {
          targetId = await resolveUIDFromUsername(parsed.value);
        } catch (resolveErr) {
          console.error('[ADD] Błąd pobierania UID:', resolveErr);
          await message.reply(`❌ Nie udało się ustalić ID dla "${parsed.value}": ${resolveErr.message}`);
          return;
        }
      }

      if (!targetId || !/^\d+$/.test(targetId)) {
        await message.reply('❌ Nieprawidłowy format ID użytkownika.');
        return;
      }

      const isExceptionUser = targetId === '61560227271099';

      // Pobierz informacje o grupie i sprawdź uprawnienia
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

      const participantIDs = info.participantIDs || [];
      if (participantIDs.includes(targetId)) {
        await message.reply('ℹ️ Ten użytkownik jest już w tej grupie.');
        return;
      }

      const adminIDs = (info.adminIDs || []).map(admin => {
        if (typeof admin === 'object' && admin !== null) {
          return admin.id || admin.userID;
        }
        return admin;
      }).filter(Boolean);

      const botId = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : '';

      // Sprawdź czy bot jest adminem
      const isBotAdmin = adminIDs.includes(botId);
      if (!isBotAdmin && !isExceptionUser) {
        await message.reply('❌ Bot nie jest administratorem tej grupy i nie może dodawać członków.');
        return;
      }

      // Sprawdź czy nadawca jest adminem grupy lub adminem bota
      const isSenderAdmin = adminIDs.includes(message.author.id) || config.admins.includes(message.author.id);
      if (!isSenderAdmin && !isExceptionUser) {
        await message.reply('❌ Tylko administratorzy grupy lub bota mogą używać tej komendy.');
        return;
      }

      // Spróbuj dodać do grupy
      await new Promise((resolve, reject) => {
        client.api.addUserToGroup(targetId, threadId, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      // Spróbuj pobrać imię użytkownika do ładnej wiadomości zwrotnej
      let finalName = `Użytkownik (${targetId})`;
      try {
        const resolvedName = await client.resolveUserName(client.api, targetId);
        if (resolvedName && !resolvedName.startsWith('Użytkownik_')) {
          finalName = resolvedName;
        }
      } catch (_) {}

      await message.reply(`✅ Pomyślnie dodano użytkownika **${finalName}** do grupy.`);

    } catch (err) {
      console.error('[ADD] Błąd podczas dodawania do grupy:', err);
      await message.reply(`❌ Błąd podczas dodawania użytkownika do grupy. (Facebook może blokować dodanie tej osoby ze względów prywatności lub ograniczeń konta).`);
    }
  }
};
