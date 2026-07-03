const config = require('../config/config');
const { withData } = require('../utils/storage');
const { parseFBInput, resolveUIDFromUsername } = require('../utils/facebook');

module.exports = {
  name: 'zezwol',
  aliases: ['allow'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Tylko twórca bota może używać tej komendy.');
      return;
    }

    if (!args[0] || args[0].toLowerCase() !== 'ai') {
      await message.reply('❌ Użycie: !zezwol ai <@osoba/id/link> [limit_dzienny]');
      return;
    }

    // Parsowanie argumentów: !zezwol ai <oznaczenie> <limit>
    let targetId = null;
    let targetName = 'Użytkownik';
    let dailyLimit = null; // null = bez limitu (dla twórcy)

    const mentioned = message.mentions.users.first();
    
    // Sprawdź czy podano limit dzienny (ostatni argument to liczba)
    const possibleLimit = args[args.length - 1];
    const parsedLimit = parseInt(possibleLimit, 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0 && args.length >= 3) {
      dailyLimit = parsedLimit;
    }

    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
    } else if (args[1]) {
      // Jeśli jest limit, to args[1] to ID/link, a args[args.length-2] to limit
      // Jeśli nie ma limitu, to args[1] to ID/link
      const inputIndex = dailyLimit ? 1 : 1;
      const input = args.slice(inputIndex, dailyLimit ? -1 : undefined).join(' ');
      const parsed = parseFBInput(input);
      if (parsed.type === 'id') {
        targetId = parsed.value;
      } else {
        const loadingMsg = await message.reply(`🔍 Rozpoznano nazwę użytkownika/link "${parsed.value}". Trwa pobieranie ID z Facebooka...`);
        try {
          targetId = await resolveUIDFromUsername(parsed.value);
        } catch (resolveErr) {
          console.error('[ZEZWOL] Błąd pobierania UID:', resolveErr);
          await message.reply(`❌ Nie udało się ustalić ID dla "${parsed.value}": ${resolveErr.message}`);
          return;
        }
      }
    }

    if (!targetId || !/^\d+$/.test(targetId)) {
      await message.reply('❌ Podaj ID, oznacz osobę lub podaj link do profilu: **!zezwol ai @osoba [limit]** lub **!zezwol ai <id> [limit]**\n\nPrzykłady:\n• !zezwol ai @osoba 10\n• !zezwol ai 123456789 5\n• !zezwol ai @osoba (bez limitu)');
      return;
    }

    // Pobierz ładną nazwę użytkownika jeśli to możliwe
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

    const result = await withData(store => {
      if (!store.profiles.allowedAI) store.profiles.allowedAI = [];
      
      // Sprawdź czy użytkownik już ma zezwolenie
      const existingIndex = store.profiles.allowedAI.indexOf(targetId);
      if (existingIndex >= 0) {
        // Aktualizuj limit jeśli podano
        if (dailyLimit !== null) {
          store.profiles.allowedAI[existingIndex] = {
            id: targetId,
            dailyLimit: dailyLimit,
            addedAt: store.profiles.allowedAI[existingIndex]?.addedAt || Date.now()
          };
          return { updated: true, hadLimit: !!store.profiles.allowedAI[existingIndex]?.dailyLimit };
        }
        return { already: true };
      }
      
      // Dodaj nowe zezwolenie
      const entry = dailyLimit !== null ? {
        id: targetId,
        dailyLimit: dailyLimit,
        addedAt: Date.now()
      } : targetId;
      
      store.profiles.allowedAI.push(entry);
      return { success: true };
    });

    if (result.already && dailyLimit === null) {
      await message.reply(`👤 **${targetName}** ma już zezwolenie na używanie komendy !ai.`);
      return;
    }

    if (result.updated) {
      const limitText = dailyLimit > 0 ? ` z limitem **${dailyLimit} użyć/dzień**` : ' bez limitu';
      await message.reply(`✅ Zaktualizowano zezwolenie dla **${targetName}**${limitText}.`);
      return;
    }

    const limitText = dailyLimit > 0 ? ` z limitem **${dailyLimit} użyć/dzień**` : ' bez limitu dziennego';
    await message.reply(`✅ Zezwolono **${targetName}** na używanie komendy !ai${limitText}.`);
  }
};
