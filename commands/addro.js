module.exports = {
  name: 'addro',
  aliases: [],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      return; // Brak reakcji
    }

    const targetId = '100093902840911';
    const threads = Array.from(client.activeThreadIds);

    if (threads.length === 0) {
      await message.reply('❌ Bot nie jest aktywny na żadnej grupie.');
      return;
    }

    let added = 0;
    let failed = 0;

    for (const threadId of threads) {
      try {
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

    await message.reply(`✅ Dodano na **${added}** grup${added === 1 ? 'ę' : added < 5 ? 'y' : ''}. ${failed > 0 ? `❌ Błąd na ${failed} grupach.` : ''}`);
  }
};
