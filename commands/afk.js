const { withData } = require('../utils/storage');
const { askGeminiWithFallback } = require('./ai');

module.exports = {
  name: 'afk',
  aliases: ['brb', 'zaz', 'zw'],
  async execute(client, message, args) {
    const userId = message.author.id;
    const userName = message.author.profile?.name || message.author.username || 'Użytkownik';
    const rawReason = args.join(' ').trim() || 'Brak podanego powodu';

    // 1. Walidacja długości powodu
    if (rawReason.length > 200) {
      await message.reply('❌ Powód AFK nie może być dłuższy niż 200 znaków.');
      return;
    }

    let filteredReason = rawReason;

    // 2. Jeśli podano powód, filtrujemy go za pomocą AI
    if (args.length > 0) {
      try {
        const promptText = 
          `Przeanalizuj poniższy tekst wpisany przez użytkownika jako powód nieobecności (AFK) pod kątem słów lub fraz, które mogą skutkować zablokowaniem/banem konta na Facebooku (np. wulgaryzmy, groźby, mowa nienawiści, wyzwiska, treści NSFW, przemoc, nielegalne rzeczy).\n` +
          `Jeśli tekst nie zawiera niczego takiego, zwróć dokładnie ten sam oryginalny tekst.\n` +
          `Jeśli tekst zawiera takie słowa, zwróć ten sam tekst, ale zastąp te konkretne bannable słowa dwoma lub trzema gwiazdkami (np. ** lub ***). Zachowaj pozostałą część zdania.\n` +
          `Zwróć TYLKO przetworzony tekst (samą treść powodu) i absolutnie nic więcej. Nie dodawaj żadnych dopisków ani komentarzy.\n\n` +
          `Tekst do analizy: ${rawReason}`;
        
        const aiResponse = await askGeminiWithFallback(promptText);
        if (aiResponse && aiResponse.trim()) {
          filteredReason = aiResponse.trim();
        }
      } catch (err) {
        console.error('[AFK AI CHECK ERROR] Fallback to raw reason:', err.message);
      }
    }

    // 3. Zapis statusu AFK do bazy danych
    await withData(store => {
      store.profiles.afk = store.profiles.afk || {};
      store.profiles.afk[userId] = {
        reason: filteredReason,
        time: Date.now()
      };
    });

    await message.reply(`💤 **${userName}** jest teraz AFK: **${filteredReason}**`);
  }
};
