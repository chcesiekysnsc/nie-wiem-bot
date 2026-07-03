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
        await message.reply({ embeds: [cooldownState.embed] }).catch(() => null);
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

      await message.reply({
        body: '🐰',
        attachment: imageUrl
      }).catch(() => null);

    } catch (err) {
      console.error('[KROLIK] Error:', err);
      await message.reply('❌ Nie udało się pobrać obrazka, spróbuj ponownie później.').catch(() => null);
    }
  }
};