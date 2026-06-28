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

    await message.reply(
      `🔄 Rozpoczynam zbieranie danych z **${threadIds.length}** grup...\n` +
      `📊 Będę analizować **${messageCount}** wiadomości z każdej grupy.\n` +
      `📈 Postęp będzie wysyłany co 10%.`
    );

    const totalGroups = threadIds.length;
    let processedCount = 0;
    const progressInterval = Math.max(1, Math.floor(totalGroups * 0.10)); // Co 10%

    // Przetwarzanie grup pojedynczo (nie równolegle)
    for (const tId of threadIds) {
      try {
        if (!client.api || typeof client.api.getThreadInfo !== 'function') {
          processedCount++;
          continue;
        }

        const info = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(null), 3000);
          client.api.getThreadInfo(tId, (err, ret) => {
            clearTimeout(timer);
            if (err) resolve(null);
            else resolve(ret);
          });
        });

        if (!info) {
          processedCount++;
          continue;
        }

        const participantIDs = info.participantIDs || [];
        const adminIDs = info.adminIDs || [];

        // Pobieranie historii wiadomości do analizy
        let actualMessageCount = 0;
        let commandCount = 0;
        let mentionCount = 0;
        let firstTimestamp = null;

        try {
          const history = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve([]), 10000); // 10s timeout
            client.api.getThreadHistory(tId, messageCount, Date.now(), (err, ret) => {
              clearTimeout(timer);
              if (err) resolve([]);
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
            visibleMessages: existingStats.visibleMessages + actualMessageCount,
            processedMessages: existingStats.processedMessages + actualMessageCount,
            commandsExecuted: existingStats.commandsExecuted + commandCount,
            mentionsCount: existingStats.mentionsCount + mentionCount,
            firstUse: existingStats.firstUse || firstTimestamp || Date.now(),
            lastUpdated: Date.now(),
            memberCount: participantIDs.length,
            adminCount: adminIDs.length,
            groupName: info.threadName || info.name || 'Grupa'
          };
        });

        processedCount++;

        // Wysyłanie postępu co 10%
        if (processedCount % progressInterval === 0 || processedCount === totalGroups) {
          const progress = Math.round((processedCount / totalGroups) * 100);
          try {
            client.api.sendMessage(
              `📊 Postęp zbierania danych: **${progress}%** (${processedCount}/${totalGroups} grup)\n` +
              `📝 Przeanalizowano **${actualMessageCount}** wiadomości z ostatniej grupy.`,
              threadId
            );
          } catch (sendErr) {
            console.error('[danegrp] Błąd wysyłania postępu:', sendErr);
          }
        }

        // Mała przerwa żeby nie przeciążyć API
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (err) {
        console.error(`[danegrp] Błąd przetwarzania grupy ${tId}:`, err.message);
        processedCount++;
      }
    }

    await message.reply(
      `✅ **Zakończono zbieranie danych!**\n\n` +
      `📊 Przetworzono **${processedCount}/${totalGroups}** grup.\n` +
      `📝 Analizowano **${messageCount}** wiadomości z każdej grupy.\n` +
      `💾 Dane zostały zapisane w bazie.\n\n` +
      `📌 Od teraz bot będzie automatycznie aktualizował statystyki przy każdej wiadomości.`
    );
  }
};
