const config = require('../config/config');

module.exports = {
  name: 'femboy',
  aliases: ['fem', 'boy'],
  async execute(client, message, args) {
    const mentionedIds = message.mentionedIds || [];
    if (mentionedIds.length === 0) {
      await message.reply('❌ Oznacz osobę, np. **!femboy @osoba**');
      return;
    }

    const targetUserId = mentionedIds[0];
    const name = await client.resolveUserName(targetUserId);

    const subadmins = ['100089655356822', '61554894353095', '100053875564339'];
    let percentage;
    let extra = '';

    if (subadmins.includes(targetUserId)) {
      percentage = 101;
      extra = '\nmożna by rzec że jesteś mały słodki kotek lary 🐱';
    } else {
      let hash = 0;
      for (let i = 0; i < targetUserId.length; i++) {
        hash = (hash << 5) - hash + targetUserId.charCodeAt(i);
        hash |= 0;
      }
      percentage = Math.abs(hash) % 101;
    }

    const replyText = `🌈 **${name}** jest femboyem w **${percentage}%**.${extra}`;
    await message.reply(replyText);
  }
};
