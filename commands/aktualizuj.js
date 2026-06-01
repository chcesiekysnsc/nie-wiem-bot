const config = require('../config/config');
const { createUser, withData } = require('../utils/storage');

// Helper to get thread history page as promise
function getThreadHistoryPage(api, threadID, amount, timestamp) {
  return new Promise((resolve) => {
    let completed = false;
    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.warn(`[AKTUALIZUJ] getThreadHistory timed out for thread ${threadID}`);
        resolve([]);
      }
    }, 12000);

    api.getThreadHistory(threadID, amount, timestamp, (err, history) => {
      clearTimeout(timeout);
      if (completed) return;
      completed = true;
      if (err) {
        console.error('[AKTUALIZUJ] getThreadHistory error:', err);
        return resolve([]);
      }
      resolve(history || []);
    });
  });
}

module.exports = {
  name: 'aktualizuj',
  aliases: ['rebuild', 'odbuduj'],
  async execute(client, message, args) {
    // Only admins can run this command
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień do użycia tej komendy.');
      return;
    }

    const threadId = message.guild?.id || message.rawEvent?.threadID;
    if (!threadId || threadId === message.author.id) {
      await message.reply('❌ Ta komenda może być używana tylko w konwersacjach grupowych.');
      return;
    }

    if (!client.api) {
      await message.reply('❌ Brak połączenia z API Messengera.');
      return;
    }

    await message.reply('🔍 **Rozpoczynam proces odzyskiwania statystyk...**\nPobieram i analizuję historię czatu (do 40 000 wiadomości). Może to zająć od kilkunastu sekund do minuty...');

    const botId = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : '';
    const prefix = client.config?.prefix || '!';

    const tempStats = {};
    let oldestTimestamp = null;
    let keepFetching = true;
    let totalFetched = 0;
    let lastChunkIndex = 0;

    try {
      while (keepFetching && totalFetched < 40000) {
        const history = await getThreadHistoryPage(client.api, threadId, 500, oldestTimestamp);
        if (!history || history.length === 0) {
          break;
        }

        totalFetched += history.length;
        let pageOldest = Infinity;

        for (const msg of history) {
          const ts = Number(msg.timestamp);
          if (ts < pageOldest) {
            pageOldest = ts;
          }

          const senderID = msg.senderID ? String(msg.senderID) : null;
          if (!senderID || senderID === botId) {
            continue;
          }

          const body = msg.body ? String(msg.body).trim() : '';
          
          // Inicjalizacja statystyk dla użytkownika
          if (!tempStats[senderID]) {
            tempStats[senderID] = {
              messageCount: 0,
              commandsUsed: 0,
              commandCounts: {}
            };
          }

          // Zliczamy wiadomość
          tempStats[senderID].messageCount++;

          // Sprawdzamy czy to komenda
          if (body.startsWith(prefix)) {
            const tokens = body.slice(prefix.length).trim().split(/\s+/);
            const cmdName = (tokens.shift() || '').toLowerCase();
            if (cmdName && client.commands.has(cmdName)) {
              tempStats[senderID].commandsUsed++;
              tempStats[senderID].commandCounts[cmdName] = (tempStats[senderID].commandCounts[cmdName] || 0) + 1;
            }
          }
        }

        // Informowanie o postępie co 5 000 wiadomości
        const chunkIndex = Math.floor(totalFetched / 5000);
        if (chunkIndex > lastChunkIndex) {
          await message.reply(`⏳ Przeanalizowano już **${totalFetched}** wiadomości z historii czatu...`);
          lastChunkIndex = chunkIndex;
        }

        // Jeśli pobrano mniej niż 500, oznacza to osiągnięcie początku czatu
        if (history.length < 500) {
          keepFetching = false;
        } else {
          oldestTimestamp = pageOldest;
        }
      }

      // Zapisujemy odzyskane dane do bazy danych stosując Math.max
      const updatedUsers = [];
      const result = await withData(async (store) => {
        for (const [senderID, stats] of Object.entries(tempStats)) {
          const user = createUser(senderID, store.users);
          
          // Podmień wartości tylko jeśli odzyskane są większe od obecnych (zapobiega nadpisywaniu nowszych aktywności)
          user.messageCount = Math.max(user.messageCount || 0, stats.messageCount);
          user.commandsUsed = Math.max(user.commandsUsed || 0, stats.commandsUsed);
          
          user.commandCounts = user.commandCounts || {};
          for (const [cmd, count] of Object.entries(stats.commandCounts)) {
            user.commandCounts[cmd] = Math.max(user.commandCounts[cmd] || 0, count);
          }

          let name = `Gracz_${senderID.slice(-6)}`;
          try {
            if (client.userNames && client.userNames.has(senderID)) {
              name = client.userNames.get(senderID);
            }
          } catch (_) {}

          updatedUsers.push({ name, msgs: user.messageCount, cmds: user.commandsUsed });
        }
        return { success: true };
      });

      if (result.success && updatedUsers.length > 0) {
        let summaryText = `✅ **ODZYSKIWANIE STATYSTYK ZAKOŃCZONE!**\n`;
        summaryText += `Przeanalizowano łącznie **${totalFetched}** wiadomości z tego czatu.\n\n`;
        summaryText += `📊 **Odzyskane dane graczy (najwyższe znalezione wartości):**\n`;
        
        // Sortujemy graczy wg liczby komend
        updatedUsers.sort((a, b) => b.cmds - a.cmds);
        
        for (const u of updatedUsers) {
          summaryText += `• **${u.name}** — Wiadomości: **${u.msgs}**, Komendy: **${u.cmds}**\n`;
        }
        
        await message.reply(summaryText);
      } else {
        await message.reply('✅ Proces zakończony. Nie odnaleziono żadnych nowych statystyk do odzyskania.');
      }

    } catch (err) {
      console.error('[AKTUALIZUJ] Blad podczas odzyskiwania:', err);
      await message.reply('❌ Wystąpił błąd podczas odzyskiwania statystyk z historii czatu.');
    }
  }
};
