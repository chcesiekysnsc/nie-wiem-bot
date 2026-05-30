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

    const sub = String(args[0] || '').toLowerCase().trim();

    if (sub === 'off' || sub === 'reset') {
      let disabled = false;
      await withData(store => {
        if (store.profiles.threadSettings && store.profiles.threadSettings[threadId] && store.profiles.threadSettings[threadId].nicknameGuard) {
          delete store.profiles.threadSettings[threadId].nicknameGuard;
          disabled = true;
        }
      });

      if (disabled) {
        await message.reply('🔓 **Wyłączono strażnika pseudonimu dla tej grupy.**');
      } else {
        await message.reply('ℹ️ Strażnik pseudonimu nie był włączony dla tej grupy.');
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
    }

    if (!targetId) {
      await message.reply(
        '🎛️ **Użycie strażnika pseudonimu:**\n\n' +
        '🔒 `!guardnick <@osoba | ID> <pseudonim>` — blokuje pseudonim wskazanego użytkownika\n' +
        '🔓 `!guardnick off` — wyłącza blokadę pseudonimu'
      );
      return;
    }

    const nickname = cleanArgs.join(' ').trim();

    if (!nickname) {
      await message.reply('❌ Musisz podać pseudonim, który ma być wymuszany: **!guardnick @osoba <pseudonim>**');
      return;
    }

    await withData(store => {
      store.profiles.threadSettings = store.profiles.threadSettings || {};
      store.profiles.threadSettings[threadId] = store.profiles.threadSettings[threadId] || {};
      store.profiles.threadSettings[threadId].nicknameGuard = {
        userId: targetId,
        nickname: nickname
      };
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
