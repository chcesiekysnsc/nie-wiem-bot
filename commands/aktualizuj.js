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

    await message.reply('🔍 **Rozpoczynam proces odzyskiwania statystyk...**\nPobieram i analizuję historię czatu (do 100 000 wiadomości). Może to zająć od kilkunastu sekund do minuty...');

    const botId = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : '';
    const prefix = client.config?.prefix || '!';

    const tempStats = {};
    let oldestTimestamp = null;
    let keepFetching = true;
    let totalFetched = 0;
    let lastChunkIndex = 0;

    try {
      while (keepFetching && totalFetched < 100000) {
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
      await withData(async (store) => {
        for (const [senderID, stats] of Object.entries(tempStats)) {
          const user = createUser(senderID, store.users);
          
          // Podmień wartości tylko jeśli odzyskane są większe od obecnych
          user.messageCount = Math.max(user.messageCount || 0, stats.messageCount);
          user.groupMessages = user.groupMessages || {};
          user.groupMessages[threadId] = Math.max(user.groupMessages[threadId] || 0, stats.messageCount);
          user.commandsUsed = Math.max(user.commandsUsed || 0, stats.commandsUsed);
          
          user.commandCounts = user.commandCounts || {};
          for (const [cmd, count] of Object.entries(stats.commandCounts)) {
            user.commandCounts[cmd] = Math.max(user.commandCounts[cmd] || 0, count);
          }
        }
      });

      // 1. Batch preload from thread info
      if (client.api && typeof client.api.getThreadInfo === 'function') {
        try {
          const threadInfo = await new Promise((resolve) => {
            client.api.getThreadInfo(threadId, (err, info) => {
              if (!err && info) {
                resolve(info);
              } else {
                resolve(null);
              }
            });
          });
          if (threadInfo && threadInfo.userInfo) {
            for (const user of threadInfo.userInfo) {
              if (user && user.id && user.name) {
                client.userNames.set(user.id, user.name);
                client.resolvedUserNames.add(user.id);
              }
            }
          }
        } catch (err) {
          console.error('[AKTUALIZUJ] Error during thread preloading:', err);
        }
      }

      // 2. Batch resolve former members who are not in the current thread participants
      const unresolvedIDs = Object.keys(tempStats).filter(id => {
        if (client.resolvedUserNames && client.resolvedUserNames.has(id)) return false;
        return true;
      });

      if (unresolvedIDs.length > 0 && client.api && typeof client.api.getUserInfo === 'function') {
        try {
          const ret = await new Promise((resolve) => {
            client.api.getUserInfo(unresolvedIDs, (err, res) => {
              if (!err && res) {
                resolve(res);
              } else {
                resolve({});
              }
            });
          });
          for (const [id, info] of Object.entries(ret)) {
            if (info && info.name) {
              client.userNames.set(id, info.name);
              client.resolvedUserNames.add(id);
            }
          }
        } catch (err) {
          console.error('[AKTUALIZUJ] Batch getUserInfo failed:', err);
        }
      }

      // 3. Save all resolved/cached names to the persistent database
      await withData(store => {
        for (const [id, name] of client.userNames.entries()) {
          if (store.users[id]) {
            store.users[id].name = name;
          }
        }
      }).catch(console.error);

      // Rozwiązujemy nazwy użytkowników poza blokadą bazy danych
      const updatedUsers = [];
      for (const senderID of Object.keys(tempStats)) {
        let name = `Gracz_${senderID.slice(-6)}`;
        try {
          name = await client.resolveUserName(client.api, senderID);
        } catch (_) {}

        const stats = tempStats[senderID];
        updatedUsers.push({ name, msgs: stats.messageCount, cmds: stats.commandsUsed });
      }

      if (updatedUsers.length > 0) {
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
