const { withData } = require('../utils/storage');
const { intelligentCensor } = require('../utils/censorship');

module.exports = {
  name: 'afk',
  aliases: ['brb', 'zaz', 'zw'],
  async execute(client, message, args) {
    const userId = message.author.id;
    const userName = message.author.profile?.name || message.author.username || 'Użytkownik';
    
    // Sprawdź czy podano tryb on/off
    if (args.length > 0 && ['on', 'off', 'wlacz', 'wylacz', '1', '0'].includes(args[0].toLowerCase())) {
      const shouldEnable = ['on', 'wlacz', '1'].includes(args[0].toLowerCase());
      
      let filteredReason = 'Nie podano powodu';
      
      await withData(async store => {
        store.profiles.afk = store.profiles.afk || {};
        
        if (shouldEnable) {
          // Włącz AFK z domyślnym powodem lub podanym
          const rawReason = args.slice(1).join(' ').trim() || 'Nie podano powodu';
          filteredReason = rawReason;
          
          // Filtruj powód za pomocą AI jeśli podano
          if (args.length > 1) {
            try {
              filteredReason = await intelligentCensor(rawReason, 'powód AFK');
            } catch (err) {
              console.error('[AFK AI CHECK ERROR] Fallback to raw reason:', err.message);
            }
          }
          
          store.profiles.afk[userId] = {
            reason: filteredReason,
            time: Date.now(),
            enabled: true
          };
        } else {
          // Wyłącz AFK
          if (store.profiles.afk[userId]) {
            delete store.profiles.afk[userId];
          }
        }
      });
      
      // Send reply after withData completes
      if (shouldEnable) {
        await message.reply(`💤 **${userName}** włączył/a AFK: **${filteredReason}**`);
      } else {
        await message.reply(`✅ **${userName}** wyłączył/a AFK.`);
      }
      
      return;
    }
    
    // Stara logika - jeśli nie podano on/off, włącz AFK z podanym powodem
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
        filteredReason = await intelligentCensor(rawReason, 'powód AFK');
      } catch (err) {
        console.error('[AFK AI CHECK ERROR] Fallback to raw reason:', err.message);
      }
    }

    // 3. Zapis statusu AFK do bazy danych
    await withData(store => {
      store.profiles.afk = store.profiles.afk || {};
      store.profiles.afk[userId] = {
        reason: filteredReason,
        time: Date.now(),
        enabled: true
      };
    });

    await message.reply(`💤 **${userName}** jest teraz AFK: **${filteredReason}**`);
  }
};
