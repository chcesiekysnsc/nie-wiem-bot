const config = require('../config/config');
const { withData } = require('../utils/storage');

module.exports = {
  name: 'danegrpinfo',
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    
    if (message.author.id !== creatorId) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const progress = await withData(store => {
      return store.profiles.danegrpProgress || null;
    });

    if (!progress) {
      await message.reply('ℹ️ Brak aktywnej analizy danych grup. Uruchom komendę **!danegrp** aby rozpocząć.');
      return;
    }

    const { totalGroups, processedGroups, startTime, isActive, messageCount, endTime } = progress;
    
    const progressPercent = totalGroups > 0 ? Math.round((processedGroups / totalGroups) * 100) : 0;
    
    let response = `📊 **Postęp analizy danych grup:**\n\n`;
    response += `🔄 Status: **${isActive ? '⏳ Aktywna' : '✅ Zakończona'}**\n`;
    response += `📈 Postęp: **${progressPercent}%** (${processedGroups}/${totalGroups} grup)\n`;
    response += `📝 Analizowano **${messageCount}** wiadomości z każdej grupy\n`;
    
    if (isActive) {
      const elapsed = Date.now() - startTime;
      const elapsedMinutes = Math.floor(elapsed / 60000);
      const elapsedSeconds = Math.floor((elapsed % 60000) / 1000);
      response += `⏱️ Czas trwania: **${elapsedMinutes}m ${elapsedSeconds}s**\n`;
      
      if (processedGroups > 0) {
        const avgTimePerGroup = elapsed / processedGroups;
        const remainingGroups = totalGroups - processedGroups;
        const estimatedRemaining = Math.floor(avgTimePerGroup * remainingGroups);
        const estMinutes = Math.floor(estimatedRemaining / 60000);
        const estSeconds = Math.floor((estimatedRemaining % 60000) / 1000);
        response += `🔮 Szacowany czas pozostały: **${estMinutes}m ${estSeconds}s**\n`;
      }
    } else if (endTime) {
      const totalTime = endTime - startTime;
      const totalMinutes = Math.floor(totalTime / 60000);
      const totalSeconds = Math.floor((totalTime % 60000) / 1000);
      response += `⏱️ Całkowity czas: **${totalMinutes}m ${totalSeconds}s**\n`;
    }

    await message.reply(response);
  }
};
