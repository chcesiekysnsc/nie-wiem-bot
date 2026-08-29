const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'zapisz',
  aliases: ['zapiszhistorie', 'zapiszhist', 'zapisz_chat'],
  async execute(client, message, args) {
    const senderId = message.author.id;
    const threadId = message.threadID;
    const now = Date.now();
    const filePath = path.join(__dirname, '..', 'data', `zapisz_${now}.json`);

    try {
      const data = client.recentMessages || [];
      const prefix = (client.config && client.config.prefix) || '!';
      const botId = String(client.api?.getCurrentUserID?.() || '');
      const filtered = data.filter(m => {
        if (!m.senderID || !m.body) return false;
        const isCommand = String(m.body).trim().startsWith(prefix);
        const isBot = botId && String(m.senderID) === botId;
        return isCommand || isBot;
      });
      fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2), 'utf8');
      const size = fs.statSync(filePath).size;
      const sizeMB = (size / 1024 / 1024).toFixed(2);
      await message.reply(`📦 Zapisano **${filtered.length}** wiadomości (${sizeMB} MB).`, {
        attachment: fs.createReadStream(filePath)
      });
    } catch (err) {
      console.error('[ZAPISZ] Error:', err);
      await message.reply('❌ Błąd podczas zapisywania historii.');
    }
  }
};
