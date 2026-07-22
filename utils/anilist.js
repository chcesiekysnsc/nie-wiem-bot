const axios = require('axios');

const ANILIST_URL = 'https://graphql.anilist.co';

const ANIME_QUERY = `
query ($search: String) {
  Page(page: 1, perPage: 1) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      title { romaji english native }
      description
      averageScore
      episodes
      status
      genres
      format
      season
      seasonYear
      coverImage { large }
      siteUrl
      studios { nodes { name } }
    }
  }
}
`;

const MANGA_QUERY = `
query ($search: String) {
  Page(page: 1, perPage: 1) {
    media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
      id
      title { romaji english native }
      description
      averageScore
      chapters
      volumes
      status
      genres
      format
      coverImage { large }
      siteUrl
    }
  }
}
`;

async function anilistRequest(query, variables = {}) {
  const res = await axios.post(ANILIST_URL, { query, variables }, {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    timeout: 15000
  });
  return res.data?.data?.Page?.media?.[0] || null;
}

async function searchAnime(query) {
  if (!query) return null;
  return anilistRequest(ANIME_QUERY, { search: query });
}

async function searchManga(query) {
  if (!query) return null;
  return anilistRequest(MANGA_QUERY, { search: query });
}

function cleanDescription(text) {
  if (!text) return 'Brak opisu.';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

function truncate(text, maxLength = 400) {
  const cleaned = cleanDescription(text);
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trim() + '...';
}

function formatStatus(status) {
  const map = {
    'FINISHED': 'Zakończone',
    'RELEASING': 'W trakcie emisji',
    'NOT_YET_RELEASED': 'Jeszcze nie emitowane',
    'CANCELLED': 'Anulowane',
    'HIATUS': 'Wstrzymane',
    'MANGA_FINISHED': 'Zakończona',
    'MANGA_PUBLISHING': 'W trakcie publikacji',
    'MANGA_NOT_YET_PUBLISHED': 'Jeszcze nie opublikowana'
  };
  return map[status] || status || 'nieznany';
}

function formatFormat(format) {
  const map = {
    'TV': 'TV',
    'TV_SHORT': 'TV Short',
    'MOVIE': 'Film',
    'SPECIAL': 'Specjal',
    'OVA': 'OVA',
    'ONA': 'ONA',
    'MUSIC': 'Klip',
    'MANGA': 'Manga',
    'NOVEL': 'Light Novel',
    'ONE_SHOT': 'One-shot',
    'MANHWA': 'Manhwa',
    'MANHUA': 'Manhua',
    'OEL': 'OEL Manga'
  };
  return map[format] || format || 'nieznany';
}

function getTitle(titleObj) {
  if (!titleObj) return 'Brak tytułu';
  return titleObj.english || titleObj.romaji || titleObj.native || 'Brak tytułu';
}

function getAltTitle(titleObj, mainTitle) {
  if (!titleObj) return null;
  const alternatives = [titleObj.romaji, titleObj.english, titleObj.native].filter(t => t && t !== mainTitle);
  return alternatives.length > 0 ? alternatives.join(' / ') : null;
}

module.exports = {
  searchAnime,
  searchManga,
  truncate,
  formatStatus,
  formatFormat,
  getTitle,
  getAltTitle,
  cleanDescription
};
