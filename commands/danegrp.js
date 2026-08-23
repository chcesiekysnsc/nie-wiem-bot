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

    await withData(store => {
      store.profiles.danegrpProgress = store.profiles.danegrpProgress || {};
      store.profiles.danegrpProgress.totalGroups = threadIds.length;
      store.profiles.danegrpProgress.processedGroups = 0;
      store.profiles.danegrpProgress.startTime = Date.now();
      store.profiles.danegrpProgress.isActive = true;
      store.profiles.danegrpProgress.shouldStop = false;
      store.profiles.danegrpProgress.messageCount = 0;
      store.profiles.danegrpProgress.totalMessagesAnalyzed = 0;
    });

    let stoppedEarly = false;

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

    for (let i = 0; i < threadIds.length; i++) {
      const tId = threadIds[i];

      if (global.danegrpAbort && global.danegrpAbort.aborted) {
        break;
      }

      let memberCount = 0;
      let adminCount = 0;
      let groupName = 'Grupa';

      // Użyj danych z bazy danych
      const { loadData } = require('../utils/storage');
      const usersData = loadData('users') || {};
      const groupParticipants = Object.entries(usersData)
        .filter(([id, u]) => u.groupMessages && u.groupMessages[tId])
        .map(([id]) => id);
      
      memberCount = groupParticipants.length;
      
      // Spróbuj pobrać nazwę grupy z danych grupy
      const groupData = loadData('groupStats') || {};
      if (groupData[tId] && groupData[tId].name) {
        groupName = groupData[tId].name;
      }

      const calculatedMsgs = threadNormalMessages[tId] || 0;

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
          visibleMessages: Math.max(existingStats.visibleMessages, calculatedMsgs),
          processedMessages: Math.max(existingStats.processedMessages, calculatedMsgs),
          commandsExecuted: Math.max(existingStats.commandsExecuted || 0, Math.round(calculatedMsgs * 0.12)),
          mentionsCount: Math.max(existingStats.mentionsCount || 0, Math.round(calculatedMsgs * 0.05)),
          firstUse: existingStats.firstUse || Date.now(),
          lastUpdated: Date.now(),
          memberCount: memberCount || existingStats.memberCount || 0,
          adminCount: adminCount || existingStats.adminCount || 0,
          groupName: groupName || existingStats.groupName || 'Grupa'
        };
      });

      processedCount++;
    }

    await withData(store => {
      const progress = store.profiles.danegrpProgress;
      if (progress) {
        progress.isActive = false;
        progress.endTime = Date.now();
      }
    });

    if (stoppedEarly) {
      await message.reply(
        `🛑 **Analiza zatrzymana!**\n\n` +
        `📊 Przetworzono: **${processedCount}/${threadIds.length}** grup.\n` +
        `💾 Dane z przetworzonych grup zostały zapisane.`
      );
    } else {
      await message.reply(
        `✅ **Zakończono analizę bazodanową!**\n\n` +
        `📊 Przetworzono: **${processedCount}/${threadIds.length}** grup.\n` +
        `💾 Zsumowano statystyki wiadomości wszystkich użytkowników z bazy danych i zsynchronizowano je z komendą **!grp**.`
      );
    }
  }
};
