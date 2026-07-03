const { withData } = require('../utils/storage');
const { checkCooldown } = require('../utils/cooldowns');
const { fetchRandomRedditImage } = require('../utils/reddit');

module.exports = {
  name: 'kotek',
  aliases: ['kitten', 'kitty', 'cat'],
  async execute(client, message, args) {
    const senderId = message.author.id;
    const creatorId = '100060812419294';
    const isOwner = senderId === creatorId;

    // Check cooldown (skip for owner)
    if (!isOwner) {
      const cooldownState = await checkCooldown('kotek', senderId);
      if (cooldownState.active) {
        await message.reply({ embeds: [cooldownState.embed] }).catch(() => null);
        return;
      }
    }

    // Send "loading" message
    const loadingMsg = await message.reply('🐱 Szukam zdjęcia małego kotka...').catch(() => null);
    
    try {
      // Fetch random kitten image from Reddit (prioritize small cat subreddits)
      const subreddits = ['IllegallySmolCats', 'Kittens', 'aww'];
      const result = await fetchRandomRedditImage(subreddits, 'małego kotka');

      if (!result) {
        await message.reply('❌ Nie udało się znaleźć zdjęcia małego kotka. Spróbuj ponownie za chwilę.').catch(() => null);
        return;
      }

      // Send the image
      await message.reply({
        body: `🐱 **${result.title}**\n\n📸 Źródło: ${result.subreddit}`,
        attachment: result.url
      }).catch(() => null);

    } catch (err) {
      console.error('[KOTEK] Error:', err);
      await message.reply('❌ Wystąpił błąd podczas pobierania zdjęcia. Spróbuj ponownie za chwilę.').catch(() => null);
    }
  }
};