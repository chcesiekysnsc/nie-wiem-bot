const { withData } = require('../utils/storage');

module.exports = {
  name: 'loop',
  aliases: [],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID || message.threadID;
    if (!threadId) {
      await message.reply('❌ Ta komenda może być używana tylko w konwersacjach grupowych.');
      return;
    }

    const senderId = String(message.author?.id || '').trim();
    const creatorId = '100060812419294';
    const isBotAdmin = (client.config?.admins || []).includes(senderId) || senderId === creatorId;

    let isGroupAdmin = false;
    if (!isBotAdmin && client.api && threadId) {
      try {
        const info = await new Promise((resolve) => {
          client.api.getThreadInfo(threadId, (err, ret) => {
            if (err) resolve(null);
            else resolve(ret);
          });
        });
        const adminIDs = (info?.adminIDs || []).map(admin => {
          if (typeof admin === 'object' && admin !== null) {
            return String(admin.id || admin.userID || '').trim();
          }
          return String(admin).trim();
        }).filter(Boolean);
        isGroupAdmin = adminIDs.includes(senderId);
      } catch (e) {
        console.error('[LOOP CMD] Error checking group admin:', e);
      }
    }

    if (!isBotAdmin && !isGroupAdmin) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla administratorów grupy oraz twórcy bota.');
      return;
    }

    const sub = String(args[0] || '').toLowerCase().trim();

    // 1. Obsługa włączenia loopu dla wszystkich (catch-all)
    if (sub === 'on') {
      await withData(store => {
        store.profiles.threadSettings = store.profiles.threadSettings || {};
        store.profiles.threadSettings[threadId] = store.profiles.threadSettings[threadId] || {};
        store.profiles.threadSettings[threadId].loopAll = true;
      });
      await message.reply('🔁 **Włączono automatyczne dodawanie (loop) dla WSZYSTKICH użytkowników w tej grupie.**\nBot będzie dodawał z powrotem każdego, kto opuści lub zostanie wyrzucony z grupy.');
      return;
    }

    // 2. Obsługa wyczyszczenia całej listy / wyłączenia loopAll
    if (sub === 'clear' || (sub === 'off' && !args[1])) {
      let cleared = false;
      await withData(store => {
        if (store.profiles.threadSettings && store.profiles.threadSettings[threadId]) {
          if (store.profiles.threadSettings[threadId].loopUsers) {
            delete store.profiles.threadSettings[threadId].loopUsers;
            cleared = true;
          }
          if (store.profiles.threadSettings[threadId].loopAll) {
            delete store.profiles.threadSettings[threadId].loopAll;
            cleared = true;
          }
        }
      });
      if (cleared) {
        await message.reply('🔓 **Wyłączono automatyczne dodawanie (loop) dla wszystkich użytkowników w tej grupie.**');
      } else {
        await message.reply('ℹ️ Brak aktywnych blokad loop w tej grupie.');
      }
      return;
    }

    // 2. Obsługa wyłączenia dla konkretnego użytkownika
    if (sub === 'off' && args[1]) {
      let targetId = null;
      const mentioned = message.mentions.users.first();
      if (mentioned) {
        targetId = mentioned.id;
      } else if (/^\d+$/.test(args[1]) && args[1].length >= 8) {
        targetId = args[1];
      }

      if (!targetId) {
        await message.reply('❌ Podaj prawidłowego użytkownika do wyłączenia: **!loop off <@osoba | ID>**');
        return;
      }

      let removed = false;
      await withData(store => {
        if (store.profiles.threadSettings && store.profiles.threadSettings[threadId] && store.profiles.threadSettings[threadId].loopUsers) {
          const originalLength = store.profiles.threadSettings[threadId].loopUsers.length;
          store.profiles.threadSettings[threadId].loopUsers = store.profiles.threadSettings[threadId].loopUsers.filter(id => id !== targetId);
          if (store.profiles.threadSettings[threadId].loopUsers.length < originalLength) {
            removed = true;
          }
          if (store.profiles.threadSettings[threadId].loopUsers.length === 0) {
            delete store.profiles.threadSettings[threadId].loopUsers;
          }
        }
      });

      if (removed) {
        await message.reply(`🔓 **Wyłączono autouzupełnianie (loop) dla użytkownika o ID: ${targetId}.**`);
      } else {
        await message.reply('ℹ️ Ten użytkownik nie ma aktywnego loopa w tej grupie.');
      }
      return;
    }

    // 3. Obsługa włączenia dla konkretnego użytkownika
    let targetId = null;
    let targetName = 'Użytkownik';

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || `Użytkownik_${targetId.slice(-6)}`;
    } else if (args[0] && /^\d+$/.test(args[0]) && args[0].length >= 8) {
      targetId = args[0];
      targetName = `Użytkownik_${targetId.slice(-6)}`;
    }

    if (!targetId) {
      // Wyświetl listę i instrukcję
      let loopedList = [];
      await withData(store => {
        if (store.profiles.threadSettings && store.profiles.threadSettings[threadId] && store.profiles.threadSettings[threadId].loopUsers) {
          loopedList = [...store.profiles.threadSettings[threadId].loopUsers];
        }
      });

      let responseText = '🔁 **Autouzupełnianie grupy (loop):**\n\n' +
        'Komenda automatycznie dodaje wskazanego użytkownika z powrotem do grupy, jeśli z niej wyjdzie lub zostanie wyrzucony.\n\n' +
        '⚙️ **Składnia:**\n' +
        '• `!loop on` — włącza loop dla WSZYSTKICH użytkowników w grupie\n' +
        '• `!loop <@osoba | ID>` — włącza loop dla danej osoby\n' +
        '• `!loop off <@osoba | ID>` — wyłącza loop dla danej osoby\n' +
        '• `!loop off` — wyłącza loop dla wszystkich w tej grupie\n\n';

      if (loopedList.length > 0) {
        responseText += `📌 **Aktualnie zapętlone ID na tej grupie:**\n` + loopedList.map(id => `• ${id}`).join('\n');
      } else {
        responseText += `ℹ️ Obecnie nikt nie jest zapętlony w tej grupie.`;
      }

      await message.reply(responseText);
      return;
    }

    // Dodaj użytkownika do listy loop
    await withData(store => {
      store.profiles.threadSettings = store.profiles.threadSettings || {};
      store.profiles.threadSettings[threadId] = store.profiles.threadSettings[threadId] || {};
      store.profiles.threadSettings[threadId].loopUsers = store.profiles.threadSettings[threadId].loopUsers || [];
      if (!store.profiles.threadSettings[threadId].loopUsers.includes(targetId)) {
        store.profiles.threadSettings[threadId].loopUsers.push(targetId);
      }
    });

    await message.reply(`🔁 **Włączono autouzupełnianie (loop) dla użytkownika!**\nOsoba: **${targetName}** (ID: ${targetId})\n\nBot natychmiast doda go z powrotem, jeśli opuści tę grupę.`);
  }
};
