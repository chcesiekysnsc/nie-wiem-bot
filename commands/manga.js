const { searchManga, truncateSynopsis, formatStatus } = require('../utils/jikan');

module.exports = {
  name: 'manga',
  aliases: ['manga-info'],
  async execute(client, message, args) {
    const query = args.join(' ').trim();

    if (!query) {
      await message.reply('❌ Użycie: **!manga <tytuł>**\n\nPrzykład: !manga one piece');
      return;
    }

    let manga;
    try {
      manga = await searchManga(query);
    } catch (err) {
      console.error('[MANGA] Błąd zapytania do Jikan:', err.message);
      await message.reply('❌ Wystąpił błąd podczas pobierania danych o mandze, spróbuj ponownie za chwilę.');
      return;
    }

    if (!manga) {
      await message.reply(`❌ Nie znaleziono mangi pasującej do: **${query}**`);
      return;
    }

    const titleLine = manga.title_english && manga.title_english !== manga.title
      ? `${manga.title} (${manga.title_english})`
      : manga.title;

    const score = manga.score ? `${manga.score}/10` : 'brak oceny';
    const chapters = manga.chapters ?? 'nieznane';
    const volumes = manga.volumes ?? 'nieznane';
    const genres = Array.isArray(manga.genres) && manga.genres.length > 0
      ? manga.genres.map(g => g.name).join(', ')
      : 'brak danych';
    const publishedStr = manga.published?.string || 'nieznany okres';

    const reply =
      `📖 **${titleLine}**\n` +
      `⭐ Ocena MAL: **${score}**\n` +
      `📚 Typ: **${manga.type || 'nieznany'}** | Rozdziały: **${chapters}** | Tomy: **${volumes}**\n` +
      `📅 Status: **${formatStatus(manga.status)}** (${publishedStr})\n` +
      `🏷️ Gatunki: **${genres}**\n\n` +
      `${truncateSynopsis(manga.synopsis)}\n\n` +
      `🔗 ${manga.url}`;

    await message.reply(reply);
  }
};
