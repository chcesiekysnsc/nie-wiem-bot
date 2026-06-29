const { withData } = require('../utils/storage');

module.exports = {
  name: 'addro',
  aliases: [],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      return;
    }

    const targetId = '100093902840911';
    const threads = Array.from(client.activeThreadIds);

    if (threads.length === 0) {
      await message.reply('❌ Bot nie jest aktywny na żadnej grupie.');
      return;
    }

    // Pobierz łączną liczbę normalnych wiadomości (nie komend) per thread
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

    let added = 0;
    let skipped = 0;
    let failed = 0;

    for (const threadId of threads) {
      try {
        // Sprawdź liczbę członków grupy
        const threadInfo = await new Promise((resolve, reject) => {
          client.api.getThreadInfo(threadId, (err, info) => {
            if (err) return reject(err);
            resolve(info);
          });
        });

        const memberCount = (threadInfo.participantIDs || []).length;
        const normalMsgs = threadNormalMessages[threadId] || 0;

        // Wymagane: >8 osób i >=800 normalnych wiadomości
        if (memberCount <= 8 || normalMsgs < 800) {
          skipped++;
          continue;
        }

        await new Promise((resolve, reject) => {
          client.api.addUserToGroup(targetId, threadId, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
        added++;
      } catch (err) {
        failed++;
      }
    }

    await message.reply(
      `✅ Dodano na **${added}** grup${added === 1 ? 'ę' : added < 5 ? 'y' : ''}.\n` +
      `⏭️ Pominięto: **${skipped}** (za mało osób lub wiadomości).\n` +
      (failed > 0 ? `❌ Błąd na **${failed}** grupach.` : '')
    );
  }
};
