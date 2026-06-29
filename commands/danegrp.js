const config = require('../config/config');
const { withData } = require('../utils/storage');

module.exports = {
  name: 'danegrp',
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    
    if (message.author.id !== creatorId) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const threadId = message.threadID || message.rawEvent?.threadID;
    
    if (!threadId) {
      await message.reply('❌ Nie można określić ID tej grupy.');
      return;
    }

    // Pobierz liczbę wiadomości do analizy z argumentów
    const messageCount = parseInt(args[0]) || 100;
    
    const threadIds = Array.from(client.activeThreadIds || []);
    
    if (threadIds.length === 0) {
      await message.reply('❌ Bot nie ma zapisanych żadnych grup.');
      return;
    }

    // Zapisz stan analizy
    await withData(store => {
      if (!store.profiles.danegrpProgress) store.profiles.danegrpProgress = {};
      store.profiles.danegrpProgress = {
        totalGroups: threadIds.length,
        processedGroups: 0,
        startTime: Date.now(),
        isActive: true,
        messageCount: messageCount,
        totalMessagesAnalyzed: 0
      };
    });

    await message.reply(
      `🔄 Rozpoczynam zbieranie danych z **${threadIds.length}** grup...\n` +
      `📊 Będę analizować **${messageCount}** wiadomości z każdej grupy.\n` +
      `📈 Postęp będzie wysyłany co 10%.\n\n` +
      `📌 Sprawdź postęp komendą **!danegrpinfo**`
    );

    const totalGroups = threadIds.length;
    let processedCount = 0;
    const progressInterval = Math.max(1, Math.floor(totalGroups * 0.10)); // Co 10%
    const batchSize = 5; // Przetwarzaj 5 grup naraz

    // Przetwarzanie grup w batchach (równolegle)
    for (let i = 0; i < threadIds.length; i += batchSize) {
      const batch = threadIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (tId) => {
        try {
          if (!client.api || typeof client.api.getThreadInfo !== 'function') {
            return { success: false };
          }

          const info = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 5000); // 5s timeout
            client.api.getThreadInfo(tId, (err, ret) => {
              clearTimeout(timer);
              if (err) resolve(null);
              else resolve(ret);
            });
          });

          const participantIDs = info ? (info.participantIDs || []) : [];
          const adminIDs = info ? (info.adminIDs || []) : [];
          const groupName = info ? (info.threadName || info.name || 'Grupa') : 'Grupa';

          // Pobieranie historii wiadomości do analizy
          let actualMessageCount = 0;
          let commandCount = 0;
          let mentionCount = 0;
          let firstTimestamp = null;

          try {
            const history = await new Promise((resolve) => {
              const timer = setTimeout(() => resolve([]), 8000); // 8s timeout
              client.api.getThreadHistory(tId, messageCount, null, (err, ret) => {
                clearTimeout(timer);
                if (err) {
                  console.error(`[danegrp] Error fetching history for thread ${tId}:`, err);
                  resolve([]);
                }
                else resolve(ret || []);
              });
            });

            if (history && history.length > 0) {
              actualMessageCount = history.length;
              
              // Analiza wiadomości
              for (const msg of history) {
                if (msg.timestamp && (!firstTimestamp || msg.timestamp < firstTimestamp)) {
                  firstTimestamp = msg.timestamp;
                }

                if (msg.body && typeof msg.body === 'string') {
                  const body = msg.body.trim();
                  
                  // Sprawdzanie czy to komenda
                  if (body.startsWith('!') || body.startsWith(config.prefix || '!')) {
                    commandCount++;
                  }

                  // Sprawdzanie oznaczeń (@)
                  const mentionMatches = body.match(/@/g);
                  if (mentionMatches) {
                    mentionCount += mentionMatches.length;
                  }
                }
              }
            }
          } catch (histErr) {
            console.error(`[danegrp] Błąd pobierania historii dla ${tId}:`, histErr.message);
          }

          // Zapisanie danych do bazy
          await withData(store => {
            if (!store.groupStats) store.groupStats = {};
            
            const existingStats = store.groupStats[tId] || {
              visibleMessages: 0,
              processedMessages: 0,
              commandsExecuted: 0,
              mentionsCount: 0,
              firstUse: Date.now()
            };

            store.groupStats[tId] = {
              visibleMessages: Math.max(existingStats.visibleMessages, actualMessageCount),
              processedMessages: Math.max(existingStats.processedMessages, actualMessageCount),
              commandsExecuted: Math.max(existingStats.commandsExecuted, commandCount),
              mentionsCount: Math.max(existingStats.mentionsCount, mentionCount),
              firstUse: existingStats.firstUse || firstTimestamp || Date.now(),
              lastUpdated: Date.now(),
              memberCount: participantIDs.length || existingStats.memberCount || 0,
              adminCount: adminIDs.length || existingStats.adminCount || 0,
              groupName: groupName || existingStats.groupName || 'Grupa'
            };
          });

          return { success: actualMessageCount > 0, actualMessageCount };

        } catch (err) {
          console.error(`[danegrp] Błąd przetwarzania grupy ${tId}:`, err.message);
          return { success: false };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      // Aktualizacja postępu
      for (const result of batchResults) {
        processedCount++;
        
        // Aktualizacja w bazie
        await withData(store => {
          if (store.profiles.danegrpProgress) {
            store.profiles.danegrpProgress.processedGroups = processedCount;
            if (result.success && result.actualMessageCount) {
              store.profiles.danegrpProgress.totalMessagesAnalyzed = 
                (store.profiles.danegrpProgress.totalMessagesAnalyzed || 0) + result.actualMessageCount;
            }
          }
        });
      }

      // Wysyłanie postępu co 10%
      if (processedCount % progressInterval === 0 || processedCount === totalGroups) {
        const progress = Math.round((processedCount / totalGroups) * 100);
        const lastResult = batchResults.filter(r => r.success).pop();
        const lastMsgCount = lastResult ? lastResult.actualMessageCount : 0;
        try {
          client.api.sendMessage(
            `📊 Postęp zbierania danych: **${progress}%** (${processedCount}/${totalGroups} grup)\n` +
            `📝 Przeanalizowano **${lastMsgCount}** wiadomości z ostatniej grupy.`,
            threadId
          );
        } catch (sendErr) {
          console.error('[danegrp] Błąd wysyłania postępu:', sendErr);
        }
      }
    }

    // Zakończ analizę
    await withData(store => {
      if (store.profiles.danegrpProgress) {
        store.profiles.danegrpProgress.isActive = false;
        store.profiles.danegrpProgress.endTime = Date.now();
      }
    });

    await message.reply(
      `✅ **Zakończono zbieranie danych!**\n\n` +
      `📊 Przetworzono **${processedCount}/${totalGroups}** grup.\n` +
      `📝 Analizowano **${messageCount}** wiadomości z każdej grupy.\n` +
      `💾 Dane zostały zapisane w bazie.\n\n` +
      `📌 Od teraz bot będzie automatycznie aktualizował statystyki przy każdej wiadomości.`
    );
  }
};
