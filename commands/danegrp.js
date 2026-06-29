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

    const threadIds = Array.from(client.activeThreadIds || []);
    
    if (threadIds.length === 0) {
      await message.reply('❌ Bot nie ma zapisanych żadnych aktywnych grup.');
      return;
    }

    await message.reply(`🔄 Rozpoczynam błyskawiczną analizę bazodanową dla **${threadIds.length}** grup...`);

    // 1. Wyciągamy sumy wiadomości z bazy danych dla wszystkich grup
    const threadNormalMessages = {};
    await withData(store => {
      for (const [userId, user] of Object.entries(store.users || {})) {
        if (user && user.groupMessages) {
          for (const [tid, count] of Object.entries(user.groupMessages)) {
            threadNormalMessages[tid] = (threadNormalMessages[tid] || 0) + count;
          }
        }
      }
    });

    let processedCount = 0;
    const batchSize = 10; // Przetwarzamy po 10 grup naraz (tylko zapytania o info o grupie)

    for (let i = 0; i < threadIds.length; i += batchSize) {
      const batch = threadIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (tId) => {
        let memberCount = 0;
        let adminCount = 0;
        let groupName = 'Grupa';
        let approvalMode = 0;
        let isGroupVal = true;
        let infoFetched = false;

        // Próba pobrania aktualnych danych o członkach i nazwie grupy z API Messengera
        try {
          if (client.api && typeof client.api.getThreadInfo === 'function') {
            const info = await new Promise((resolve) => {
              const timer = setTimeout(() => resolve(null), 3000); // 3s timeout
              client.api.getThreadInfo(tId, (err, ret) => {
                clearTimeout(timer);
                if (err) resolve(null);
                else resolve(ret);
              });
            });

            if (info) {
              memberCount = (info.participantIDs || []).length;
              adminCount = (info.adminIDs || []).length;
              groupName = info.threadName || info.name || 'Grupa';
              approvalMode = info.approvalMode || 0;
              isGroupVal = info.isGroup !== undefined ? info.isGroup : true;
              infoFetched = true;
            }
          }
        } catch (err) {
          console.error(`[danegrp] Błąd pobierania info dla grupy ${tId}:`, err.message);
        }

        const calculatedMsgs = threadNormalMessages[tId] || 0;

        // Zapisanie przeliczonych danych bezpośrednio do groupStats
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
            // Używamy wyliczonej sumy wiadomości z bazy lub dotychczasowych statystyk (wybieramy większą)
            visibleMessages: Math.max(existingStats.visibleMessages, calculatedMsgs),
            processedMessages: Math.max(existingStats.processedMessages, calculatedMsgs),
            // Szacujemy komendy (12%) i oznaczenia (5%) jeśli dotychczasowe statystyki są puste
            commandsExecuted: Math.max(existingStats.commandsExecuted || 0, Math.round(calculatedMsgs * 0.12)),
            mentionsCount: Math.max(existingStats.mentionsCount || 0, Math.round(calculatedMsgs * 0.05)),
            firstUse: existingStats.firstUse || Date.now(),
            lastUpdated: Date.now(),
            memberCount: memberCount || existingStats.memberCount || 0,
            adminCount: adminCount || existingStats.adminCount || 0,
            groupName: groupName || existingStats.groupName || 'Grupa',
            approvalMode: infoFetched ? approvalMode : (existingStats.approvalMode || 0),
            isGroup: infoFetched ? isGroupVal : (existingStats.isGroup !== undefined ? existingStats.isGroup : true)
          };
        });

        return true;
      });

      await Promise.all(batchPromises);
      processedCount += batch.length;
    }

    await message.reply(
      `✅ **Zakończono analizę bazodanową!**\n\n` +
      `📊 Przetworzono: **${processedCount}/${threadIds.length}** grup.\n` +
      `💾 Zsumowano statystyki wiadomości wszystkich użytkowników z bazy danych i zsynchronizowano je z komendą **!grp**.`
    );
  }
};
