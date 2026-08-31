const crypto = require('crypto');

function safeSend(api, content, threadID) {
  return new Promise((resolve) => {
    let completed = false;
    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.warn('[ZAPISZ] safeSend timed out');
        resolve(false);
      }
    }, 10000);

    api.sendMessage(content, threadID, (err) => {
      clearTimeout(timeout);
      if (completed) return;
      completed = true;
      if (err) {
        console.error('[ZAPISZ] safeSend error:', err);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

module.exports = {
  name: 'zapisz',
  aliases: ['export', 'interactions', 'historia'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    if (!client.recentMessages || client.recentMessages.length === 0) {
      await message.reply('❌ Brak zapisanych interakcji do eksportu.');
      return;
    }

    const interactionsString = JSON.stringify(client.recentMessages, null, 2);
    console.log(`[ZAPISZ] Eksportowanie ${client.recentMessages.length} interakcji, rozmiar ${interactionsString.length} znaków.`);

    const key = crypto.randomBytes(16).toString('hex');
    global.interactionsKey = key;
    global.latestInteractions = interactionsString;

    const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
    let downloadUrl = '';
    if (publicDomain) {
      downloadUrl = `https://${publicDomain.replace(/\/$/, '')}/interactions?key=${key}`;
    } else {
      downloadUrl = `http://[twoj-adres-bota].up.railway.app/interactions?key=${key}\n*(Zastąp [twoj-adres-bota] domeną swojego bota, którą znajdziesz w panelu Railway w zakładce Settings -> Public Networking -> Domain)*`;
    }

    const threadId = message.threadID;
    await safeSend(client.api, `✅ **Eksport interakcji gotowy!**\n\nLiczba interakcji: ${client.recentMessages.length}\n\nMożesz je pobrać bezpośrednio:\n🔗 **Pobierz stąd:** ${downloadUrl}\n\nOtwórz ten link w przeglądarce, a plik \`interactions.json\` pobierze się automatycznie.`, threadId);
  }
};
