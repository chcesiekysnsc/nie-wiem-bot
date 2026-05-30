const config = require('../config/config');
const { withData } = require('../utils/storage');

module.exports = {
  name: 'nick',
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

    // Sprawdź czy target ma strażnika pseudonimów
    let guard = null;
    await withData(store => {
      if (store.profiles.threadSettings && store.profiles.threadSettings[threadId] && store.profiles.threadSettings[threadId].nicknameGuard) {
        guard = store.profiles.threadSettings[threadId].nicknameGuard;
      }
    });

    if (guard && String(guard.userId) === String(targetId) && nickname !== guard.nickname) {
      await message.reply(`❌ Użytkownik ma zablokowany pseudonim przez strażnika (**${guard.nickname}**).`);
      return;
    }

    client.api.changeNickname(nickname, threadId, targetId, (err) => {
      if (err) {
        console.error('[NICK COMMAND ERROR]', err);
        message.reply(`❌ Nie udało się zmienić pseudonimu: ${err.errorSummary || err.message || err}`).catch(() => null);
        return;
      }
      if (nickname) {
        message.reply(`✅ Zmieniono pseudonim użytkownika **${targetName}** na: **${nickname}**`).catch(() => null);
      } else {
        message.reply(`✅ Usunięto pseudonim użytkownika **${targetName}**`).catch(() => null);
      }
    });
  }
};
