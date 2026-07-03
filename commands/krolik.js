const { withData } = require('../utils/storage');
const { checkCooldown } = require('../utils/cooldowns');
const { fetchRandomRedditImage } = require('../utils/reddit');

module.exports = {
  name: 'krolik',
  aliases: ['rabbit', 'bunny'],
  async execute(client, message, args) {
    const senderId = message.author.id;
    const creatorId = '100060812419294';
    const isOwner = senderId === creatorId;

    // Check cooldown (skip for owner)
    if (!isOwner) {
      const cooldownState = await checkCooldown('krolik', senderId);
      if (cooldownState.active) {
        await message.reply({ embeds: [cooldownState.embed] }).catch(() => null);
        return;
      }
    }

    // Send "loading" message
    const loadingMsg = await message.reply('🐰 Szukam zdjęcia królika...').catch(() => null);
    
    try {
      // Fetch random rabbit image from Reddit
      const subreddits = ['Rabbits', 'Bunnies', 'Rabbit'];
      const result = await fetchRandomRedditImage(subreddits, 'królika');

      if (!result) {
        await message.reply('❌ Nie udało się znaleźć zdjęcia królika. Spróbuj ponownie za chwilę.').catch(() => null);
        return;
      }

      // Send the image
      await message.reply({
        body: `🐰 **${result.title}**\n\n📸 Źródło: ${result.subreddit}`,
        attachment: result.url
      }).catch(() => null);

    } catch (err) {
      console.error('[KROLIK] Error:', err);
      await message.reply('❌ Wystąpił błąd podczas pobierania zdjęcia. Spróbuj ponownie za chwilę.').catch(() => null);
    }
  }
};