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

    // Obsługa wbudowanego w Messenger @everyone / @wszyscy
    let cleanContent = content;
    const hasEveryone = /@wszyscy/i.test(cleanContent) || /@everyone/i.test(cleanContent);
    cleanContent = cleanContent.replace(/@wszyscy/gi, '@everyone').replace(/@everyone/gi, '@everyone');

    const msgPayload = hasEveryone ? {
      body: cleanContent,
      mentions: [{ tag: '@everyone', id: 'everyone' }]
    } : cleanContent;

    const excludedGroupId = '2094120197822035';

    if (client.api) {
      const targets = Array.from(client.activeThreadIds).filter(tId => tId !== excludedGroupId);
      if (targets.length > 0) {
        for (const tId of targets) {
          client.api.sendMessage(msgPayload, tId);
        }
        await message.reply(`📣 Rozesłano wiadomość do ${targets.length} grup/wątków (z wykluczeniem grupy o ID: ${excludedGroupId}).`);
      } else {
        const threadId = message.guild?.id || message.rawEvent?.threadID;
        if (threadId && threadId !== excludedGroupId) {
          client.api.sendMessage(msgPayload, threadId);
        } else if (threadId === excludedGroupId) {
          await message.reply('❌ Ta grupa jest wykluczona z komendy !say.');
        }
      }
    }
  }
};
