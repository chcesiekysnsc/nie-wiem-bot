const { withData } = require('../utils/storage');

module.exports = {
  name: 'guardnick',
  aliases: [],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Tylko twórca bota może zarządzać strażnikiem pseudonimu.');
      return;
    }

    const threadId = message.guild?.id || message.rawEvent?.threadID;
    if (!threadId) {
      await message.reply('❌ Ta komenda może być używana tylko w konwersacjach grupowych.');
      return;
    }

    if (!client.api) {
      await message.reply('❌ Brak połączenia z API Messengera.');
      return;
    }

    const firstArg = String(args[0] || '').toLowerCase().trim();

    if (firstArg === 'off' || firstArg === 'reset') {
      const secondArg = String(args[1] || '').toLowerCase().trim();
      
      // Sprawdź czy chcą wyłączyć dla wszystkich
      if (secondArg === 'all' || secondArg === 'wszystko' || secondArg === 'wszyscy') {
        let disabled = false;
        await withData(store => {
          if (store.profiles.threadSettings && store.profiles.threadSettings[threadId]) {
            const settings = store.profiles.threadSettings[threadId];
            if (settings.nicknameGuards || settings.nicknameGuard) {
              delete settings.nicknameGuard;
              delete settings.nicknameGuards;
              disabled = true;
            }
          }
        });

        if (disabled) {
          await message.reply('🔓 **Wyłączono strażnika pseudonimu dla wszystkich użytkowników w tej grupie.**');
        } else {
          await message.reply('ℹ️ Strażnik pseudonimu nie był włączony dla żadnego użytkownika w tej grupie.');
        }
        return;
      }

      // Sprawdź cel (wzmiankowany lub podany przez ID, domyślnie autor)
      let targetId = null;
      let targetName = 'Użytkownik';

      const mentioned = message.mentions.users.first();
      const cleanArgs = args.slice(1);

      if (mentioned) {
        targetId = mentioned.id;
        targetName = mentioned.username || `Użytkownik_${targetId.slice(-6)}`;
      } else if (cleanArgs[0] && /^\d+$/.test(cleanArgs[0]) && cleanArgs[0].length >= 8) {
        targetId = cleanArgs[0];
        targetName = `Użytkownik_${targetId.slice(-6)}`;
      } else {
        targetId = message.author.id;
        targetName = message.author.username || 'siebie';
      }

      let disabled = false;
      await withData(store => {
        if (store.profiles.threadSettings && store.profiles.threadSettings[threadId]) {
          const settings = store.profiles.threadSettings[threadId];
          
          // Migracja starego nicknameGuard
          if (settings.nicknameGuard) {
            settings.nicknameGuards = settings.nicknameGuards || {};
            settings.nicknameGuards[settings.nicknameGuard.userId] = settings.nicknameGuard.nickname;
            delete settings.nicknameGuard;
          }

          if (settings.nicknameGuards && settings.nicknameGuards[targetId]) {
            delete settings.nicknameGuards[targetId];
            disabled = true;
            if (Object.keys(settings.nicknameGuards).length === 0) {
              delete settings.nicknameGuards;
            }
          }
        }
      });

      if (disabled) {
        await message.reply(`🔓 **Wyłączono strażnika pseudonimu dla użytkownika: ${targetName}** (ID: ${targetId})`);
      } else {
        await message.reply(`ℹ️ Użytkownik **${targetName}** (ID: ${targetId}) nie ma aktywnego strażnika pseudonimu.`);
      }
      return;
    }

    let targetId = null;
    let targetName = 'Użytkownik';

    const mentioned = message.mentions.users.first();
    const cleanArgs = [...args];

    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || `Użytkownik_${targetId.slice(-6)}`;
      const mentionIndex = cleanArgs.findIndex(arg => arg.includes(mentioned.id));
      if (mentionIndex !== -1) {
        cleanArgs.splice(mentionIndex, 1);
      }
    } else if (cleanArgs[0] && /^\d+$/.test(cleanArgs[0]) && cleanArgs[0].length >= 8) {
      targetId = cleanArgs[0];
      targetName = `Użytkownik_${targetId.slice(-6)}`;
      cleanArgs.shift();
    } else {
      targetId = message.author.id;
      targetName = message.author.username || 'siebie';
    }

    let nickname = '';
    if (mentioned && message.rawEvent?.mentions) {
      const mentionText = message.rawEvent.mentions[targetId] || '';
      const fullArgsText = args.join(' ');
      
      let cleanedText = fullArgsText;
      if (mentionText) {
        cleanedText = cleanedText.replace(`@${mentionText}`, '');
        cleanedText = cleanedText.replace(mentionText, '');
      }
      cleanedText = cleanedText.replace(/^\s*@\S+/, '');
      nickname = cleanedText.trim().replace(/\s+/g, ' ');
    } else {
      nickname = cleanArgs.join(' ').trim();
    }

    if (!nickname) {
      await message.reply('❌ Musisz podać pseudonim, który ma być wymuszany: **!guardnick @osoba <pseudonim>**');
      return;
    }

    await withData(store => {
      store.profiles.threadSettings = store.profiles.threadSettings || {};
      store.profiles.threadSettings[threadId] = store.profiles.threadSettings[threadId] || {};
      
      const settings = store.profiles.threadSettings[threadId];
      
      // Migracja starego nicknameGuard
      if (settings.nicknameGuard) {
        settings.nicknameGuards = settings.nicknameGuards || {};
        settings.nicknameGuards[settings.nicknameGuard.userId] = settings.nicknameGuard.nickname;
        delete settings.nicknameGuard;
      }

      settings.nicknameGuards = settings.nicknameGuards || {};
      settings.nicknameGuards[targetId] = nickname;
    });

    // Natychmiastowe wymuszenie pseudonimu
    client.api.changeNickname(nickname, threadId, targetId, (err) => {
      if (err) {
        console.error('[GUARDNICK INITIATION ERROR]', err);
      }
    });

    await message.reply(`🔒 **Włączono strażnika pseudonimu!**\nUżytkownik: **${targetName}** (ID: ${targetId})\nZablokowany pseudonim: **${nickname}**`);
  }
};
