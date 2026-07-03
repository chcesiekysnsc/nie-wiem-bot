const config = require('../config/config');
const { withData } = require('../utils/storage');
const { askGeminiWithFallback } = require('./ai');

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

    // Filtruj pseudonim za pomocą AI jeśli nie jest pusty
    if (nickname) {
      try {
        const promptText = 
          `Przeanalizuj poniższy tekst jako proponowany pseudonim użytkownika pod kątem słów lub fraz, które mogą skutkować zablokowaniem/banem konta na Facebooku (np. wulgaryzmy, groźby, mowa nienawiści, wyzwiska, treści NSFW, przemoc, nielegalne rzeczy).\n` +
          `Jeśli tekst nie zawiera niczego takiego, zwróć dokładnie ten sam oryginalny tekst.\n` +
          `Jeśli tekst zawiera takie słowa, zwróć ten sam tekst, ale zastąp te konkretne bannable słowa dwoma lub trzema gwiazdkami (np. ** lub ***). Zachowaj pozostałą część zdania.\n` +
          `Zwróć TYLKO przetworzony tekst (samą treść pseudonimu) i absolutnie nic więcej. Nie dodawaj żadnych dopisków ani komentarzy.\n\n` +
          `Tekst do analizy: ${nickname}`;
        
        const aiResponse = await askGeminiWithFallback(promptText);
        if (aiResponse && aiResponse.trim()) {
          nickname = aiResponse.trim();
        }
      } catch (err) {
        console.error('[NICK AI CHECK ERROR] Fallback to raw nickname:', err.message);
      }
    }

    // Sprawdź czy target ma strażnika pseudonimów
    let guardNickname = null;
    await withData(store => {
      if (store.profiles.threadSettings && store.profiles.threadSettings[threadId]) {
        const settings = store.profiles.threadSettings[threadId];
        if (settings.nicknameGuards && settings.nicknameGuards[targetId]) {
          guardNickname = settings.nicknameGuards[targetId];
        } else if (settings.nicknameGuard && String(settings.nicknameGuard.userId) === String(targetId)) {
          guardNickname = settings.nicknameGuard.nickname;
        }
      }
    });

    if (guardNickname && nickname !== guardNickname) {
      await message.reply(`❌ Użytkownik ma zablokowany pseudonim przez strażnika (**${guardNickname}**).`);
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
