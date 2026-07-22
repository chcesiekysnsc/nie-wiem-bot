const { searchAnime, truncateSynopsis, formatStatus } = require('../utils/jikan');

module.exports = {
  name: 'anime',
  aliases: ['anime-info'],
  async execute(client, message, args) {
    const query = args.join(' ').trim();

    if (!query) {
      await message.reply('❌ Użycie: **!anime <tytuł>**\n\nPrzykład: !anime attack on titan');
      return;
    }

    let anime;
    try {
      anime = await searchAnime(query);
    } catch (err) {
      console.error('[ANIME] Błąd zapytania do Jikan:', err.message);
      await message.reply('❌ Wystąpił błąd podczas pobierania danych o anime, spróbuj ponownie za chwilę.');
      return;
    }

    if (!anime) {
      await message.reply(`❌ Nie znaleziono anime pasującego do: **${query}**`);
      return;
    }

    const titleLine = anime.title_english && anime.title_english !== anime.title
      ? `${anime.title} (${anime.title_english})`
      : anime.title;

    const score = anime.score ? `${anime.score}/10` : 'brak oceny';
    const episodes = anime.episodes ?? 'nieznane';
    const genres = Array.isArray(anime.genres) && anime.genres.length > 0
      ? anime.genres.map(g => g.name).join(', ')
      : 'brak danych';
    const airedStr = anime.aired?.string || 'nieznany okres';

    const reply =
      `🎬 **${titleLine}**\n` +
      `⭐ Ocena MAL: **${score}**\n` +
      `📺 Typ: **${anime.type || 'nieznany'}** | Odcinki: **${episodes}**\n` +
      `📅 Status: **${formatStatus(anime.status)}** (${airedStr})\n` +
      `🏷️ Gatunki: **${genres}**\n\n` +
      `${truncateSynopsis(anime.synopsis)}\n\n` +
      `🔗 ${anime.url}`;

    await message.reply(reply);
  }
};
