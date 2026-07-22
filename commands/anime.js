const { searchAnime, truncate, formatStatus, formatFormat, getTitle, getAltTitle } = require('../utils/anilist');

module.exports = {
  name: 'anime',
  aliases: ['anime-info', 'animeinfo'],
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
      console.error('[ANIME] Błąd zapytania do AniList:', err.message);
      await message.reply('❌ Wystąpił błąd podczas pobierania danych o anime, spróbuj ponownie za chwilę.');
      return;
    }

    if (!anime) {
      await message.reply(`❌ Nie znaleziono anime pasującego do: **${query}**`);
      return;
    }

    const titleObj = anime.title || {};
    const mainTitle = getTitle(titleObj);
    const altTitle = getAltTitle(titleObj, mainTitle);
    const titleLine = altTitle ? `${mainTitle} (${altTitle})` : mainTitle;

    const score = anime.averageScore ? `${anime.averageScore / 10}/10` : 'brak oceny';
    const episodes = anime.episodes ?? 'nieznane';
    const genres = Array.isArray(anime.genres) && anime.genres.length > 0
      ? anime.genres.join(', ')
      : 'brak danych';
    const studios = anime.studios?.nodes?.length
      ? anime.studios.nodes.map(s => s.name).join(', ')
      : 'brak danych';
    const seasonYear = anime.seasonYear ? `${anime.season || ''} ${anime.seasonYear}`.trim() : 'nieznany';
    const format = formatFormat(anime.format);

    const reply =
      `🎬 **${titleLine}**\n` +
      `⭐ Ocena AniList: **${score}**\n` +
      `📺 Typ: **${format}** | Odcinki: **${episodes}**\n` +
      `📅 Status: **${formatStatus(anime.status)}** | Sezon: **${seasonYear}**\n` +
      `🏢 Studio: **${studios}**\n` +
      `🏷️ Gatunki: **${genres}**\n\n` +
      `${truncate(anime.description)}\n\n` +
      `🔗 ${anime.siteUrl || 'https://anilist.co'}`;

    await message.reply(reply);
  }
};
