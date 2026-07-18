const { withData } = require('../utils/storage');

module.exports = {
  name: 'stopdanegrpinfo',
  aliases: ['stopdanegrp'],
  async execute(client, message) {
    const creatorId = '100060812419294';

    if (message.author.id !== creatorId) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const result = await withData(store => {
      const progress = store.profiles.danegrpProgress;
      if (!progress || !progress.isActive) {
        return { stopped: false, reason: 'Brak aktywnej analizy danych grup.' };
      }
      progress.shouldStop = true;
      progress.isActive = false;
      progress.endTime = Date.now();
      return { stopped: true };
    });

    if (result.stopped) {
      global.danegrpAbort = global.danegrpAbort || { aborted: false };
      global.danegrpAbort.aborted = true;
      await message.reply('🛑 Wysłano natychmiastowe zatrzymanie analizy.');
    } else {
      await message.reply(`ℹ️ ${result.reason}`);
    }
  }
};
