module.exports = {
  name: 'amelcia',
  aliases: [],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      return;
    }

    if (!client.api) {
      return;
    }

    const targetId = '61562475523609';
    const threads = Array.from(client.activeThreadIds || []);

    if (threads.length === 0) {
      await message.reply('❌ Bot nie jest aktywny na żadnej grupie.');
      return;
    }

    let added = 0;
    let alreadyIn = 0;
    let failed = 0;

    for (const threadId of threads) {
      try {
        // Sprawdź czy targetId jest już w grupie używając danych z bazy
        const { loadData } = require('../utils/storage');
        const usersData = loadData('users') || {};
        const isAlreadyInGroup = usersData[targetId] && usersData[targetId].groupMessages && usersData[targetId].groupMessages[threadId];
        
        if (isAlreadyInGroup) {
          alreadyIn++;
          continue;
        }

        await new Promise((resolve, reject) => {
          client.api.addUserToGroup(targetId, threadId, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });

        added++;

        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (err) {
        failed++;
      }
    }

    await message.reply(
      `✅ Dodano na **${added}** grup${added === 1 ? 'ę' : added < 5 ? 'y' : ''}.\n` +
      `ℹ️ Już obecne na: **${alreadyIn}** grupach.\n` +
      (failed > 0 ? `❌ Błąd na **${failed}** grupach.` : '')
    );
  }
};
