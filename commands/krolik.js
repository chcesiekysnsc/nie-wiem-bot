const axios = require('axios');
const { checkCooldown } = require('../utils/cooldowns');
const { fetchRedditImage } = require('../utils/reddit');

module.exports = {
  name: 'krolik',
  aliases: ['rabbit', 'bunny', 'królik'],
  async execute(client, message, args) {
    const senderId = message.author.id;
    const creatorId = '100060812419294';
    const isOwner = senderId === creatorId;

    if (!isOwner) {
      const cooldownState = await checkCooldown('krolik', senderId);
      if (cooldownState.active) {
        const cooldownText = typeof cooldownState.embed?.toMessageText === 'function'
          ? cooldownState.embed.toMessageText()
          : String(cooldownState.embed || '');
        await message.reply(cooldownText).catch(() => null);
        return;
      }
    }

    await message.reply('🐰 Szukam zdjęcia królika...').catch(() => null);

    try {
      const imageUrl = await fetchRedditImage('rabbits');

      if (!imageUrl) {
        await message.reply('❌ Nie udało się pobrać obrazka, spróbuj ponownie później.').catch(() => null);
        return;
      }

      const threadId = message.guild?.id || message.rawEvent?.threadID;
      if (client.api && threadId) {
        const response = await axios.get(imageUrl, { responseType: 'stream' });
        await client.api.sendMessage({
          body: '🐰',
          attachment: response.data
        }, threadId);
      } else {
        await message.reply('🐰').catch(() => null);
      }

    } catch (err) {
      console.error('[KROLIK] Error:', err);
      await message.reply('❌ Nie udało się pobrać obrazka, spróbuj ponownie później.').catch(() => null);
    }
  }
};
