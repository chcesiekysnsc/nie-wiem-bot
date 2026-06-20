const fs = require('fs');
const https = require('https');
const path = require('path');
const config = require('../config/config');
const { parseFBInput, resolveUIDFromUsername } = require('../utils/facebook');

module.exports = {
  name: 'admin',
  aliases: [],
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

    const mode = String(args[0] || '').toLowerCase();
    if (mode !== 'give' && mode !== 'del') {
      await message.reply('❌ Użyj: **!admin give @osoba** lub **!admin del @osoba**');
      return;
    }

    const targetArg = args.slice(1).join(' ');
    if (!targetArg) {
      await message.reply(`❌ Podaj kogo chcesz oznaczyć, podać ID lub link: **!admin ${mode} @osoba**`);
      return;
    }

    try {
      // 1. Pobierz informacje o wątku grupowym
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

      // 2. Pobierz ID administratorów grupy
      const adminIDs = (info.adminIDs || []).map(admin => {
        if (typeof admin === 'object' && admin !== null) {
          return admin.id || admin.userID;
        }
        return admin;
      }).filter(Boolean);

      const botId = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : '';

      // 3. Sprawdź czy bot jest adminem grupy
      const isBotAdmin = adminIDs.includes(botId);
      if (!isBotAdmin) {
        await message.reply('❌ Bot nie jest administratorem tej grupy! Musisz najpierw nadać botowi admina w grupie, aby mógł zarządzać uprawnieniami innych.');
        return;
      }

      // 4. Sprawdź czy nadawca jest adminem grupy lub adminem bota
      const isSenderAdmin = adminIDs.includes(message.author.id) || config.admins.includes(message.author.id);
      if (!isSenderAdmin) {
        await message.reply('❌ Tylko administratorzy tej grupy lub bota mogą używać tej komendy.');
        return;
      }

      // 5. Rozpoznaj cel (target)
      let targetId = null;
      let targetName = 'Użytkownik';

      const mentioned = message.mentions.users.first();
      if (mentioned) {
        targetId = mentioned.id;
        targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
      } else {
        const parsed = parseFBInput(targetArg);
        if (parsed.type === 'id') {
          targetId = parsed.value;
        } else {
          const loadingMsg = await message.reply(`🔍 Rozpoznano nazwę użytkownika/link "${parsed.value}". Trwa pobieranie ID z Facebooka...`);
          try {
            targetId = await resolveUIDFromUsername(parsed.value);
          } catch (resolveErr) {
            console.error('[ADMIN] Błąd pobierania UID:', resolveErr);
            await message.reply(`❌ Nie udało się ustalić ID dla "${parsed.value}": ${resolveErr.message}`);
            return;
          }
        }
      }

      if (!targetId || !/^\d+$/.test(targetId)) {
        await message.reply(`❌ Nie udało się zidentyfikować użytkownika. Użyj: **!admin ${mode} @osoba**`);
        return;
      }

      // Pobierz imię celu
      if (client.userNames.has(targetId)) {
        targetName = client.userNames.get(targetId);
      } else {
        try {
          const resolvedName = await client.resolveUserName(client.api, targetId);
          if (resolvedName && !resolvedName.startsWith('Użytkownik_')) {
            targetName = resolvedName;
          } else {
            targetName = `Uzytkownik_${targetId.slice(-6)}`;
          }
        } catch (_) {
          targetName = `Uzytkownik_${targetId.slice(-6)}`;
        }
      }

      const shouldBeAdmin = mode === 'give';

      // Sprawdź czy zmiana jest potrzebna
      const isTargetAlreadyAdmin = adminIDs.includes(targetId);
      if (shouldBeAdmin && isTargetAlreadyAdmin) {
        await message.reply(`👑 **${targetName}** jest już administratorem tej grupy.`);
        return;
      }
      if (!shouldBeAdmin && !isTargetAlreadyAdmin) {
        await message.reply(`ℹ️ **${targetName}** nie jest administratorem tej grupy.`);
        return;
      }

      // 6. Wywołaj zmianę statusu admina
      await new Promise((resolve, reject) => {
        client.api.changeAdminStatus(threadId, targetId, shouldBeAdmin, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      if (shouldBeAdmin) {
        await message.reply(`👑 Pomyślnie mianowano **${targetName}** administratorem grupy.`);
      } else {
        await message.reply(`✅ Pomyślnie odebrano uprawnienia administratora grupowego dla **${targetName}**.`);
      }

    } catch (err) {
      console.error('[ADMIN-CMD] Błąd podczas zmiany uprawnień administratora:', err);
      await message.reply(`❌ Błąd podczas modyfikowania uprawnień. (Facebook może blokować tę operację ze względów bezpieczeństwa).`);
    }
  }
};
