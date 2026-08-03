const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { checkCooldown } = require('../utils/cooldowns');
const { fetchRedditImage } = require('../utils/reddit');

module.exports = {
  name: 'fox',
  aliases: ['lis', 'liszka', 'vulpes'],
  async execute(client, message, args) {
    const senderId = message.author.id;
    const creatorId = '100060812419294';
    const isOwner = senderId === creatorId;

    if (!isOwner) {
      const cooldownState = await checkCooldown('fox', senderId);
      if (cooldownState.active) {
        const cooldownText = typeof cooldownState.embed?.toMessageText === 'function'
          ? cooldownState.embed.toMessageText()
          : String(cooldownState.embed || '');
        await message.reply(cooldownText).catch(() => null);
        return;
      }
    }

    await message.reply('🦊 Szukam zdjęcia liska...').catch(() => null);

    try {
      const imageUrl = await fetchRedditImage('foxes');

      if (!imageUrl) {
        await message.reply('❌ Nie udało się pobrać obrazka, spróbuj ponownie później.').catch(() => null);
        return;
      }

      const threadId = message.guild?.id || message.rawEvent?.threadID;
      if (client.api && threadId) {
        const urlPart = imageUrl.split('?')[0];
        const extMatch = urlPart.match(/\.([a-zA-Z0-9]+)$/);
        const ext = extMatch ? extMatch[1] : 'jpg';
        const tempFile = path.join(__dirname, `temp_fox_${Date.now()}.${ext}`);

        try {
          const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
          fs.writeFileSync(tempFile, response.data);

          await new Promise((resolve, reject) => {
            client.api.sendMessage({
              body: '🦊',
              attachment: fs.createReadStream(tempFile)
            }, threadId, (err) => {
              fs.unlink(tempFile, () => {});
              if (err) reject(err);
              else resolve();
            });
          });
        } catch (err) {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
          }
          throw err;
        }
      } else {
        await message.reply('🦊').catch(() => null);
      }

    } catch (err) {
      console.error('[FOX] Error:', err);
      await message.reply('❌ Nie udało się pobrać obrazka, spróbuj ponownie później.').catch(() => null);
    }
  }
};
