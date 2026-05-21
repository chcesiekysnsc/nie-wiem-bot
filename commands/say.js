const config = require('../config/config');

module.exports = {
  name: 'say',
  aliases: ['powiedz'],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień do tej komendy.');
      return;
    }

    const content = args.join(' ');
    if (!content.trim()) {
      await message.reply('❌ Podaj treść wiadomości.');
      return;
    }

    if (client.api) {
      const targets = Array.from(client.activeThreadIds);
      if (targets.length > 0) {
        for (const tId of targets) {
          client.api.sendMessage(content, tId);
        }
        await message.reply(`📣 Rozesłano wiadomość do ${targets.length} grup/wątków.`);
      } else {
        const threadId = message.guild?.id || message.rawEvent?.threadID;
        if (threadId) {
          client.api.sendMessage(content, threadId);
        }
      }
    }
  }
};
