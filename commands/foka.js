const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { checkCooldown } = require('../utils/cooldowns');

module.exports = {
  name: 'foka',
  aliases: ['foki', 'foczki', 'seal'],
  async execute(client, message, args) {
    const senderId = message.author.id;
    const creatorId = '100060812419294';
    const isOwner = senderId === creatorId;

    if (!isOwner) {
      const cooldownState = await checkCooldown('foka', senderId);
      if (cooldownState.active) {
        const cooldownText = typeof cooldownState.embed?.toMessageText === 'function'
          ? cooldownState.embed.toMessageText()
          : String(cooldownState.embed || '');
        await message.reply(cooldownText).catch(() => null);
        return;
      }
    }

    await message.reply('🦭 Szukam zdjęcia foki...').catch(() => null);

    try {
      const imageUrl = 'https://loremflickr.com/640/480/seal';

      const threadId = message.guild?.id || message.rawEvent?.threadID;
      if (client.api && threadId) {
        const tempFile = path.join(__dirname, `temp_foka_${Date.now()}.jpg`);

        try {
          const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000, maxRedirects: 5 });
          fs.writeFileSync(tempFile, response.data);

          await new Promise((resolve, reject) => {
            client.api.sendMessage({
              body: '🦭',
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
        await message.reply('🦭').catch(() => null);
      }

    } catch (err) {
      console.error('[FOKA] Error:', err);
      await message.reply('❌ Nie udało się pobrać obrazka, spróbuj ponownie później.').catch(() => null);
    }
  }
};
