const { checkCooldown } = require('../utils/cooldowns');
const { fetchRedditImage } = require('../utils/reddit');

module.exports = {
  name: 'kotek',
  aliases: ['kitten', 'kitty', 'cat'],
  async execute(client, message, args) {
    const senderId = message.author.id;
    const creatorId = '100060812419294';
    const isOwner = senderId === creatorId;

    if (!isOwner) {
      const cooldownState = await checkCooldown('kotek', senderId);
      if (cooldownState.active) {
        await message.reply({ embeds: [cooldownState.embed] }).catch(() => null);
        return;
      }
    }

    await message.reply('🐱 Szukam zdjęcia małego kotka...').catch(() => null);

    try {
      const imageUrl = await fetchRedditImage('kitten');

      if (!imageUrl) {
        await message.reply('❌ Nie udało się pobrać obrazka, spróbuj ponownie później.').catch(() => null);
        return;
      }

      await message.reply({
        body: '',
        attachment: imageUrl
      }).catch(() => null);

    } catch (err) {
      console.error('[KOTEK] Error:', err);
      await message.reply('❌ Nie udało się pobrać obrazka, spróbuj ponownie później.').catch(() => null);
    }
  }
};