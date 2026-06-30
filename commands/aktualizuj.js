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
        resolve(null);
      }
    }, 12000);

    api.getThreadHistory(threadID, amount, timestamp, (err, history) => {
      clearTimeout(timeout);
      if (completed) return;
      completed = true;
      if (err) {
        console.error('[AKTUALIZUJ] getThreadHistory error:', err);
        return resolve(null);
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
    let fetchErrorOccurred = false;

    // Statystyki grupy do odzyskania
    let groupVisibleMessages = 0;
    let groupCommandsExecuted = 0;
    let groupMentionsCount = 0;
    let groupFirstTimestamp = null;
    let seenMessageIds = [];

    await withData(store => {
      if (store.groupStats && store.groupStats[threadId] && store.groupStats[threadId].seenMessageIds) {
        seenMessageIds = [...store.groupStats[threadId].seenMessageIds];
      }
    });

    try {
      while (keepFetching && totalFetched < 100000) {
        const history = await getThreadHistoryPage(client.api, threadId, 500, oldestTimestamp);
        if (history === null) {
          fetchErrorOccurred = true;
          break;
        }
        if (history.length === 0) {
          break;
        }

        totalFetched += history.length;
        let pageOldest = Infinity;

        for (const msg of history) {
          const ts = Number(msg.timestamp);
          if (ts < pageOldest) {
            pageOldest = ts;
          }

          const msgId = msg.messageID;
          if (msgId && seenMessageIds.includes(msgId)) {
            continue;
          }
          if (msgId) {
            seenMessageIds.push(msgId);
          }

          if (ts && (!groupFirstTimestamp || ts < groupFirstTimestamp)) {
            groupFirstTimestamp = ts;
          }

          groupVisibleMessages++;

          const body = msg.body ? String(msg.body).trim() : '';

          // Liczenie oznaczeń w historii
          if (body) {
            const mentionMatches = body.match(/@/g);
            if (mentionMatches) {
              groupMentionsCount += mentionMatches.length;
            }
          }

          const senderID = msg.senderID ? String(msg.senderID) : null;
          if (!senderID || senderID === botId) {
            continue;
          }
          
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
              groupCommandsExecuted++;
            }
          }
        }

        // Informowanie o postępie co 5 000 wiadomości
        const chunkIndex = Math.floor(totalFetched / 5000);
        if (chunkIndex > lastChunkIndex) {
          await message.reply(`⏳ Przeanalizowano już **${totalFetched}** wiadomości z historii czatu...`);
          lastChunkIndex = chunkIndex;
        }

        // Dodajemy opóźnienie 800ms, aby uniknąć blokady Rate Limit ze strony Facebooka
        await new Promise(resolve => setTimeout(resolve, 800));

        // Pobieramy dalej, dopóki Messenger zwraca wiadomości (cofając się o 1 ms wstecz, aby uniknąć nakładania się)
        if (pageOldest !== Infinity && !isNaN(pageOldest)) {
          oldestTimestamp = pageOldest - 1;
        } else {
          break;
        }
      }

      // Zapisujemy odzyskane dane do bazy danych, dodając nowe niewliczone wiadomości
      await withData(async (store) => {
        // Jeśli seenMessageIds jest puste, oznacza to pierwszy bieg (migrację)
        const isMigration = !store.groupStats?.[threadId]?.seenMessageIds;

        for (const [senderID, stats] of Object.entries(tempStats)) {
          const user = createUser(senderID, store.users);
          
          if (isMigration) {
            // Pierwszy bieg: używamy Math.max, żeby nie zduplikować liczników gracza
            user.messageCount = Math.max(user.messageCount || 0, stats.messageCount);
            user.groupMessages = user.groupMessages || {};
            user.groupMessages[threadId] = Math.max(user.groupMessages[threadId] || 0, stats.messageCount);
            user.commandsUsed = Math.max(user.commandsUsed || 0, stats.commandsUsed);
            
            user.commandCounts = user.commandCounts || {};
            for (const [cmd, count] of Object.entries(stats.commandCounts)) {
              user.commandCounts[cmd] = Math.max(user.commandCounts[cmd] || 0, count);
            }
          } else {
            // Kolejne biegi: dodajemy tylko nowe, niewliczone wcześniej wiadomości
            user.messageCount = (user.messageCount || 0) + stats.messageCount;
            user.groupMessages = user.groupMessages || {};
            user.groupMessages[threadId] = (user.groupMessages[threadId] || 0) + stats.messageCount;
            user.commandsUsed = (user.commandsUsed || 0) + stats.commandsUsed;
            
            user.commandCounts = user.commandCounts || {};
            for (const [cmd, count] of Object.entries(stats.commandCounts)) {
              user.commandCounts[cmd] = (user.commandCounts[cmd] || 0) + count;
            }
          }
        }

        // Aktualizacja statystyk grupy
        if (!store.groupStats) store.groupStats = {};
        const existingStats = store.groupStats[threadId] || {
          visibleMessages: 0,
          processedMessages: 0,
          commandsExecuted: 0,
          mentionsCount: 0,
          firstUse: Date.now()
        };

        // Zatrzymujemy maksymalnie 2000 ostatnich widzianych wiadomości
        if (seenMessageIds.length > 2000) {
          seenMessageIds = seenMessageIds.slice(-2000);
        }

        if (isMigration) {
          store.groupStats[threadId] = {
            visibleMessages: Math.max(existingStats.visibleMessages || 0, groupVisibleMessages),
            processedMessages: Math.max(existingStats.processedMessages || 0, groupVisibleMessages),
            commandsExecuted: Math.max(existingStats.commandsExecuted || 0, groupCommandsExecuted),
            mentionsCount: Math.max(existingStats.mentionsCount || 0, groupMentionsCount),
            firstUse: existingStats.firstUse || groupFirstTimestamp || Date.now(),
            lastUpdated: Date.now(),
            memberCount: existingStats.memberCount || 0,
            adminCount: existingStats.adminCount || 0,
            groupName: existingStats.groupName || 'Grupa',
            seenMessageIds: seenMessageIds
          };
        } else {
          store.groupStats[threadId] = {
            visibleMessages: (existingStats.visibleMessages || 0) + groupVisibleMessages,
            processedMessages: (existingStats.processedMessages || 0) + groupVisibleMessages,
            commandsExecuted: (existingStats.commandsExecuted || 0) + groupCommandsExecuted,
            mentionsCount: (existingStats.mentionsCount || 0) + groupMentionsCount,
            firstUse: existingStats.firstUse || groupFirstTimestamp || Date.now(),
            lastUpdated: Date.now(),
            memberCount: existingStats.memberCount || 0,
            adminCount: existingStats.adminCount || 0,
            groupName: existingStats.groupName || 'Grupa',
            seenMessageIds: seenMessageIds
          };
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
          if (threadInfo) {
            if (threadInfo.userInfo) {
              for (const user of threadInfo.userInfo) {
                if (user && user.id && user.name) {
                  client.userNames.set(user.id, user.name);
                  client.resolvedUserNames.add(user.id);
                }
              }
            }
            // Zapisujemy dodatkowe dane grupy z getThreadInfo
            await withData(store => {
              if (!store.groupStats) store.groupStats = {};
              if (store.groupStats[threadId]) {
                store.groupStats[threadId].memberCount = (threadInfo.participantIDs || []).length;
                store.groupStats[threadId].adminCount = (threadInfo.adminIDs || []).length;
                store.groupStats[threadId].groupName = threadInfo.threadName || threadInfo.name || 'Grupa';
              }
            });
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

      let summaryText = `✅ **ODZYSKIWANIE STATYSTYK ZAKOŃCZONE!**\n`;
      summaryText += `Przeanalizowano łącznie **${totalFetched}** wiadomości z tego czatu.\n`;

      if (updatedUsers.length > 0) {
        const newMsgs = updatedUsers.reduce((s, u) => s + u.msgs, 0);
        summaryText += `📥 Nowe (niewliczone wcześniej) wiadomości: **${newMsgs}**\n\n`;
        summaryText += `📊 **Odzyskane dane graczy:**\n`;
        
        updatedUsers.sort((a, b) => b.cmds - a.cmds);
        
        for (const u of updatedUsers) {
          summaryText += `• **${u.name}** — Wiadomości: **${u.msgs}**, Komendy: **${u.cmds}**\n`;
        }
      } else {
        summaryText += `\n📭 Wszystkie wiadomości z historii były już wcześniej wliczone. Brak nowych danych do dodania.`;
      }

      if (fetchErrorOccurred) {
        summaryText += `\n\n⚠️ *Uwaga: Proces został przerwany przedwcześnie z powodu limitów API Facebooka (Rate Limit).*`;
      }
      
      await message.reply(summaryText);

    } catch (err) {
      console.error('[AKTUALIZUJ] Blad podczas odzyskiwania:', err);
      await message.reply('❌ Wystąpił błąd podczas odzyskiwania statystyk z historii czatu.');
    }
  }
};
