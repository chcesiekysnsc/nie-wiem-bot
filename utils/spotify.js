const axios = require('axios');
const qs = require('querystring');
const config = require('../config/config');
const { withData, loadData, saveData } = require('./storage');

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';

const { spotify: spotifyConfig } = config;

if (!spotifyConfig.clientId || !spotifyConfig.clientSecret) {
  console.warn('[SPOTIFY] Brak SPOTIFY_CLIENT_ID lub SPOTIFY_CLIENT_SECRET w configu. Komendy !spotify nie będą działać.');
}

const stateStore = new Map();
const requestQueue = [];
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 4;

const userCache = new Map();
const CACHE_TTL = {
  currentlyPlaying: 30 * 1000,
  top: 60 * 60 * 1000,
  recent: 5 * 60 * 1000,
  profile: 5 * 60 * 1000
};

function getCacheKey(userId, type) {
  return `${userId}:${type}`;
}

function getCached(userId, type) {
  const entry = userCache.get(getCacheKey(userId, type));
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL[type]) {
    userCache.delete(getCacheKey(userId, type));
    return null;
  }
  return entry.data;
}

function setCache(userId, type, data) {
  userCache.set(getCacheKey(userId, type), { ts: Date.now(), data });
}

async function withRateLimit(fn) {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise(resolve => requestQueue.push(resolve));
  }
  activeRequests++;
  try {
    return await fn();
  } finally {
    activeRequests--;
    if (requestQueue.length > 0) {
      const next = requestQueue.shift();
      next();
    }
  }
}

async function getSpotifyTokens(userId) {
  return withData(store => {
    const spotifyData = store.spotify || {};
    const userData = spotifyData[userId] || null;
    return userData || null;
  });
}

async function saveSpotifyTokens(userId, tokens) {
  return withData(store => {
    if (!store.spotify) store.spotify = {};
    store.spotify[userId] = tokens;
    return store.spotify[userId];
  });
}

async function removeSpotifyTokens(userId) {
  return withData(store => {
    if (!store.spotify) store.spotify = {};
    delete store.spotify[userId];
  });
}

async function getValidAccessToken(userId) {
  const tokens = await getSpotifyTokens(userId);
  if (!tokens || !tokens.access_token) return null;

  if (tokens.expires_at && Date.now() >= tokens.expires_at) {
    if (!tokens.refresh_token) return null;
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    if (!refreshed) return null;
    await saveSpotifyTokens(userId, refreshed);
    return refreshed.access_token;
  }

  return tokens.access_token;
}

async function refreshAccessToken(refreshToken) {
  try {
    const credentials = Buffer.from(`${spotifyConfig.clientId}:${spotifyConfig.clientSecret}`).toString('base64');
    const response = await axios.post(
      SPOTIFY_TOKEN_URL,
      qs.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const data = response.data;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_at: Date.now() + (data.expires_in * 1000)
    };
  } catch (error) {
    console.error('[SPOTIFY] Błąd odświeżania tokenu:', error.message);
    return null;
  }
}

async function spotifyRequest(userId, endpoint, options = {}) {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return { error: '❌ Brak połączenia z Spotify. Użyj `!spotify połącz`.' };
  }

  return withRateLimit(async () => {
    try {
      const response = await axios.get(`${SPOTIFY_API_BASE}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        params: options.params || {}
      });
      return { data: response.data };
    } catch (error) {
      if (error.response && error.response.status === 401) {
        return { error: '❌ Sesja Spotify wygasła. Użyj `!spotify połącz` aby ponownie się połączyć.' };
      }
      if (error.response && error.response.status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 5;
        return { error: `⏳ Zbyt wiele zapytań do Spotify. Spróbuj za ${retryAfter} sekund.` };
      }
      return { error: `❌ Błąd Spotify API: ${error.message}` };
    }
  });
}

async function spotifyPostRequest(userId, endpoint, body = {}) {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return { error: '❌ Brak połączenia z Spotify. Użyj `!spotify połącz`.' };
  }

  return withRateLimit(async () => {
    try {
      const response = await axios.post(`${SPOTIFY_API_BASE}${endpoint}`, body, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      return { data: response.data };
    } catch (error) {
      if (error.response && error.response.status === 401) {
        return { error: '❌ Sesja Spotify wygasła. Użyj `!spotify połącz` aby ponownie się połączyć.' };
      }
      if (error.response && error.response.status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 5;
        return { error: `⏳ Zbyt wiele zapytań do Spotify. Spróbuj za ${retryAfter} sekund.` };
      }
      return { error: `❌ Błąd Spotify API: ${error.message}` };
    }
  });
}

function getAuthUrl(userId, state) {
  const params = {
    client_id: spotifyConfig.clientId,
    response_type: 'code',
    redirect_uri: spotifyConfig.redirectUri,
    scope: spotifyConfig.scopes.join(' '),
    state: state,
    show_dialog: 'false'
  };
  return `${SPOTIFY_AUTH_URL}?${qs.stringify(params)}`;
}

async function exchangeCodeForTokens(code) {
  try {
    const credentials = Buffer.from(`${spotifyConfig.clientId}:${spotifyConfig.clientSecret}`).toString('base64');
    const response = await axios.post(
      SPOTIFY_TOKEN_URL,
      qs.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: spotifyConfig.redirectUri
      }),
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const data = response.data;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000)
    };
  } catch (error) {
    console.error('[SPOTIFY] Błąd wymiany kodu na token:', error.message);
    return null;
  }
}

async function getCurrentlyPlaying(userId) {
  const cached = getCached(userId, 'currentlyPlaying');
  if (cached) return { data: cached };

  const result = await spotifyRequest(userId, '/me/player/currently-playing');
  if (result.error) return result;
  if (!result.data || !result.data.item) {
    return { data: null };
  }

  const track = result.data.item;
  const data = {
    isPlaying: result.data.is_playing,
    track: {
      id: track.id,
      name: track.name,
      artists: track.artists.map(a => a.name).join(', '),
      album: track.album.name,
      cover: track.album.images?.[0]?.url || null,
      url: track.external_urls?.spotify || null,
      duration_ms: track.duration_ms
    },
    progress_ms: result.data.progress_ms
  };

  setCache(userId, 'currentlyPlaying', data);
  return { data };
}

async function getTopTracks(userId, timeRange = 'medium_term') {
  const cached = getCached(userId, 'top');
  if (cached) return { data: cached };

  const result = await spotifyRequest(userId, '/me/top/tracks', { params: { time_range: timeRange, limit: 10 } });
  if (result.error) return result;

  const data = result.data.items.map(item => ({
    id: item.id,
    name: item.name,
    artists: item.artists.map(a => a.name).join(', '),
    album: item.album.name,
    cover: item.album.images?.[0]?.url || null,
    url: item.external_urls?.spotify || null,
    popularity: item.popularity
  }));

  setCache(userId, 'top', data);
  return { data };
}

async function getTopArtists(userId, timeRange = 'medium_term') {
  const cached = getCached(userId, 'top');
  if (cached) return { data: cached };

  const result = await spotifyRequest(userId, '/me/top/artists', { params: { time_range: timeRange, limit: 10 } });
  if (result.error) return result;

  const data = result.data.items.map(item => ({
    id: item.id,
    name: item.name,
    genres: item.genres?.slice(0, 3) || [],
    followers: item.followers?.total || 0,
    image: item.images?.[0]?.url || null,
    url: item.external_urls?.spotify || null
  }));

  setCache(userId, 'top', data);
  return { data };
}

async function getRecentlyPlayed(userId, limit = 20) {
  const cached = getCached(userId, 'recent');
  if (cached) return { data: cached };

  const result = await spotifyRequest(userId, '/me/player/recently-played', { params: { limit } });
  if (result.error) return result;

  const data = result.data.items.map(item => ({
    track: {
      id: item.track.id,
      name: item.track.name,
      artists: item.track.artists.map(a => a.name).join(', '),
      album: item.track.album.name,
      cover: item.track.album.images?.[0]?.url || null,
      url: item.track.external_urls?.spotify || null
    },
    played_at: item.played_at
  }));

  setCache(userId, 'recent', data);
  return { data };
}

async function getUserProfile(userId) {
  const cached = getCached(userId, 'profile');
  if (cached) return { data: cached };

  const result = await spotifyRequest(userId, '/me');
  if (result.error) return result;

  const data = {
    id: result.data.id,
    display_name: result.data.display_name,
    email: result.data.email,
    country: result.data.country,
    product: result.data.product,
    followers: result.data.followers?.total || 0,
    image: result.data.images?.[0]?.url || null,
    url: result.data.external_urls?.spotify || null
  };

  setCache(userId, 'profile', data);
  return { data };
}

async function getGroupListening(groupMembers) {
  const results = await Promise.all(
    groupMembers.map(async userId => {
      const result = await getCurrentlyPlaying(userId);
      if (result.error || !result.data) return null;
      return { userId, ...result.data };
    })
  );

  return results.filter(r => r !== null);
}

async function addToQueue(userId, trackUri) {
  return spotifyPostRequest(userId, '/me/player/queue', { uri: trackUri });
}

async function playTrack(userId, trackUri) {
  return spotifyPostRequest(userId, '/me/player/play', { uris: [trackUri] });
}

async function searchTrack(query) {
  try {
    const response = await axios.get(`${SPOTIFY_API_BASE}/search`, {
      params: { q: query, type: 'track', limit: 1 }
    });
    if (response.data.tracks?.items?.[0]) {
      const track = response.data.tracks.items[0];
      return {
        id: track.id,
        name: track.name,
        artists: track.artists.map(a => a.name).join(', '),
        uri: track.uri,
        url: track.external_urls?.spotify || null
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

function getTimeRangeLabel(timeRange) {
  const labels = {
    'short_term': 'ostatni miesiąc (1m)',
    'medium_term': 'ostatnie 6 miesięcy (6m)',
    'long_term': 'ostatnie 12 miesięcy (12m)'
  };
  return labels[timeRange] || timeRange;
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  getSpotifyTokens,
  saveSpotifyTokens,
  removeSpotifyTokens,
  getValidAccessToken,
  getCurrentlyPlaying,
  getTopTracks,
  getTopArtists,
  getRecentlyPlayed,
  getUserProfile,
  getGroupListening,
  addToQueue,
  playTrack,
  searchTrack,
  getTimeRangeLabel
};
