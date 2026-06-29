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

    // Pobierz dane grup z bazy danych
    const threadNormalMessages = {};
    const threadRestoreEnabled = {};
    await withData(store => {
      for (const [userId, user] of Object.entries(store.users || {})) {
        if (user && user.groupMessages) {
          for (const [tid, count] of Object.entries(user.groupMessages)) {
            threadNormalMessages[tid] = (threadNormalMessages[tid] || 0) + count;
          }
        }
      }
      if (store.profiles.threadSettings) {
        for (const [tid, settings] of Object.entries(store.profiles.threadSettings)) {
          threadRestoreEnabled[tid] = settings ? settings.unsendLoggingEnabled !== false : true;
        }
      }
    });

    let added = 0;
    let skipped = 0;
    let failed = 0;

    for (const threadId of threads) {
      try {
        // Sprawdź informacje o grupie
        const threadInfo = await new Promise((resolve, reject) => {
          client.api.getThreadInfo(threadId, (err, info) => {
            if (err) return reject(err);
            resolve(info);
          });
        });

        const memberCount = (threadInfo.participantIDs || []).length;
        const normalMsgs = threadNormalMessages[threadId] || 0;
        const isApprovalEnabled = threadInfo.approvalMode === 1;
        const isRestoreEnabled = threadRestoreEnabled[threadId] !== false;

        // Wymagane: >8 osób, >=800 normalnych wiadomości, zatwierdzanie wyłączone, przywracanie włączone
        if (memberCount <= 8 || normalMsgs < 800 || isApprovalEnabled || !isRestoreEnabled) {
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
      `⏭️ Pominięto: **${skipped}** (za mało osób/wiadomości lub włączone zatwierdzanie / wyłączone przywracanie).\n` +
      (failed > 0 ? `❌ Błąd na **${failed}** grupach.` : '')
    );
  }
};
