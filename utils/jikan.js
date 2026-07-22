const axios = require('axios');

const JIKAN_BASE = 'https://api.jikan.moe/v4';

async function jikanRequest(url, params, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, { params, timeout: 15000 });
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 && attempt < retries) {
        console.warn(`[JIKAN] Rate limit (429), ponawiam próbę ${attempt + 1}/${retries}...`);
        await new Promise(resolve => setTimeout(resolve, 1200));
        continue;
      }
      throw err;
    }
  }
}

async function searchAnime(query) {
  const data = await jikanRequest(`${JIKAN_BASE}/anime`, { q: query, limit: 1, sfw: true });
  return data?.data?.[0] || null;
}

async function searchManga(query) {
  const data = await jikanRequest(`${JIKAN_BASE}/manga`, { q: query, limit: 1, sfw: true });
  return data?.data?.[0] || null;
}

function truncateSynopsis(text, maxLength = 400) {
  if (!text) return 'Brak opisu.';
  const cleaned = text.replace(/\[Written by MAL Rewrite\]/gi, '').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trim() + '...';
}

function formatStatus(status) {
  const map = {
    'Finished Airing': 'Zakonczone (emisja)',
    'Currently Airing': 'W trakcie emisji',
    'Not yet aired': 'Jeszcze nie emitowane',
    'Finished': 'Zakonczona',
    'Publishing': 'W trakcie publikacji',
    'On Hiatus': 'Wstrzymana',
    'Discontinued': 'Przerwana',
    'Not yet published': 'Jeszcze nie opublikowana'
  };
  return map[status] || status || 'nieznany';
}

module.exports = {
  searchAnime,
  searchManga,
  truncateSynopsis,
  formatStatus
};
