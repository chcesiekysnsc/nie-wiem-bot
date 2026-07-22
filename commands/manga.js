const { searchManga, truncate, formatStatus, formatFormat, getTitle, getAltTitle } = require('../utils/anilist');

module.exports = {
  name: 'manga',
  aliases: ['manga-info', 'mangainfo'],
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
      console.error('[MANGA] Błąd zapytania do AniList:', err.message);
      await message.reply('❌ Wystąpił błąd podczas pobierania danych o mandze, spróbuj ponownie za chwilę.');
      return;
    }

    if (!manga) {
      await message.reply(`❌ Nie znaleziono mangi pasującej do: **${query}**`);
      return;
    }

    const titleObj = manga.title || {};
    const mainTitle = getTitle(titleObj);
    const altTitle = getAltTitle(titleObj, mainTitle);
    const titleLine = altTitle ? `${mainTitle} (${altTitle})` : mainTitle;

    const score = manga.averageScore ? `${manga.averageScore / 10}/10` : 'brak oceny';
    const chapters = manga.chapters ?? 'nieznane';
    const volumes = manga.volumes ?? 'nieznane';
    const genres = Array.isArray(manga.genres) && manga.genres.length > 0
      ? manga.genres.join(', ')
      : 'brak danych';
    const format = formatFormat(manga.format);

    const reply =
      `📖 **${titleLine}**\n` +
      `⭐ Ocena AniList: **${score}**\n` +
      `📚 Typ: **${format}** | Rozdziały: **${chapters}** | Tomy: **${volumes}**\n` +
      `📅 Status: **${formatStatus(manga.status)}**\n` +
      `🏷️ Gatunki: **${genres}**\n\n` +
      `${truncate(manga.description)}\n\n` +
      `🔗 ${manga.siteUrl || 'https://anilist.co'}`;

    await message.reply(reply);
  }
};
