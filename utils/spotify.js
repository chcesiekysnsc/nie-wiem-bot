const fs = require('fs');
const https = require('https');
const path = require('path');
const config = require('../config/config');

const SPOTIFY_DB_PATH = path.join(__dirname, '..', 'data', 'spotify.json');

// Helper to make HTTPS requests
function makeRequest(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(requestOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

function loadSpotifyDb() {
  try {
    if (!fs.existsSync(SPOTIFY_DB_PATH)) {
      fs.writeFileSync(SPOTIFY_DB_PATH, JSON.stringify({}), 'utf8');
      return {};
    }
    const raw = fs.readFileSync(SPOTIFY_DB_PATH, 'utf8');
    return JSON.parse(raw) || {};
  } catch (err) {
    console.error('[SPOTIFY] Error loading database:', err);
    return {};
  }
}

function saveSpotifyDb(db) {
  try {
    fs.writeFileSync(SPOTIFY_DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('[SPOTIFY] Error saving database:', err);
  }
}

// Generate Auth link for Spotify OAuth 2.0
function getAuthUrl(userId, threadId) {
  const clientId = config.spotify.clientId;
  const redirectUri = encodeURIComponent(config.spotify.redirectUri);
  const state = `${userId}_${threadId}`;
  const scopes = encodeURIComponent([
    'user-read-currently-playing',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-recently-played',
    'user-top-read',
    'user-read-private'
  ].join(' '));

  return `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scopes}&state=${state}`;
}

// Exchange Code for Access/Refresh Tokens
async function exchangeCodeForTokens(code) {
  const clientId = config.spotify.clientId;
  const clientSecret = config.spotify.clientSecret;
  const redirectUri = config.spotify.redirectUri;
  const authHeader = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const postData = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri
  }).toString();

  const response = await makeRequest('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, postData);

  if (response.statusCode !== 200) {
    throw new Error(`Błąd autoryzacji Spotify (HTTP ${response.statusCode}): ${response.body}`);
  }

  return JSON.parse(response.body);
}

// Refresh Access Token
async function refreshAccessToken(refreshToken) {
  const clientId = config.spotify.clientId;
  const clientSecret = config.spotify.clientSecret;
  const authHeader = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const postData = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  }).toString();

  const response = await makeRequest('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, postData);

  if (response.statusCode !== 200) {
    throw new Error(`Błąd odświeżania tokenu Spotify (HTTP ${response.statusCode}): ${response.body}`);
  }

  return JSON.parse(response.body);
}

// Get Access Token for User (with auto-refresh)
async function getAccessToken(userId) {
  const db = loadSpotifyDb();
  const user = db[userId];
  if (!user || !user.accessToken) {
    return null;
  }

  // Odśwież token na 60 sekund przed wygaśnięciem
  if (Date.now() >= (user.expiresAt - 60000)) {
    console.log(`[SPOTIFY] Token dla użytkownika ${userId} wygasł lub wygasa. Odświeżanie...`);
    try {
      const refreshed = await refreshAccessToken(user.refreshToken);
      user.accessToken = refreshed.access_token;
      user.expiresAt = Date.now() + (refreshed.expires_in * 1000);
      if (refreshed.refresh_token) {
        user.refreshToken = refreshed.refresh_token;
      }
      db[userId] = user;
      saveSpotifyDb(db);
    } catch (err) {
      console.error(`[SPOTIFY] Nie udało się odświeżyć tokenu dla użytkownika ${userId}:`, err);
      return null;
    }
  }

  return user.accessToken;
}

// Spotify API - Profil
async function getProfile(accessToken) {
  const response = await makeRequest('https://api.spotify.com/v1/me', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (response.statusCode !== 200) {
    throw new Error(`Blad API (HTTP ${response.statusCode})`);
  }
  return JSON.parse(response.body);
}

// Spotify API - Obecnie odtwarzane
async function getCurrentlyPlaying(accessToken) {
  const response = await makeRequest('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (response.statusCode === 204 || response.statusCode === 404) {
    return null;
  }
  if (response.statusCode !== 200) {
    throw new Error(`Blad API (HTTP ${response.statusCode})`);
  }
  return JSON.parse(response.body);
}

// Spotify API - Ostatnio odtwarzane
async function getRecentlyPlayed(accessToken, limit = 5) {
  const response = await makeRequest(`https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (response.statusCode !== 200) {
    throw new Error(`Blad API (HTTP ${response.statusCode})`);
  }
  return JSON.parse(response.body);
}

// Spotify API - Top Utwory
async function getTopTracks(accessToken, timeRange = 'medium_term', limit = 5) {
  const response = await makeRequest(`https://api.spotify.com/v1/me/top/tracks?limit=${limit}&time_range=${timeRange}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (response.statusCode !== 200) {
    throw new Error(`Blad API (HTTP ${response.statusCode})`);
  }
  return JSON.parse(response.body);
}

// Spotify API - Top Artyści
async function getTopArtists(accessToken, timeRange = 'medium_term', limit = 5) {
  const response = await makeRequest(`https://api.spotify.com/v1/me/top/artists?limit=${limit}&time_range=${timeRange}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (response.statusCode !== 200) {
    throw new Error(`Blad API (HTTP ${response.statusCode})`);
  }
  return JSON.parse(response.body);
}

// Spotify API - Wyszukiwanie utworu
async function searchTrack(accessToken, query) {
  const response = await makeRequest(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (response.statusCode !== 200) {
    throw new Error(`Blad API (HTTP ${response.statusCode})`);
  }
  const data = JSON.parse(response.body);
  if (data.tracks && data.tracks.items && data.tracks.items.length > 0) {
    return data.tracks.items[0];
  }
  return null;
}

// Spotify API - Odtwórz utwór (PUT /play)
async function playTrack(accessToken, trackUri) {
  const postData = JSON.stringify({ uris: [trackUri] });
  const response = await makeRequest('https://api.spotify.com/v1/me/player/play', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, postData);

  if (response.statusCode === 404) {
    throw new Error('device_not_found');
  }
  if (response.statusCode !== 204 && response.statusCode !== 200) {
    throw new Error(`Blad API (HTTP ${response.statusCode})`);
  }
  return true;
}

// Spotify API - Dodaj do kolejki (POST /queue)
async function addToQueue(accessToken, trackUri) {
  const response = await makeRequest(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(trackUri)}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (response.statusCode === 404) {
    throw new Error('device_not_found');
  }
  if (response.statusCode !== 204 && response.statusCode !== 200) {
    throw new Error(`Blad API (HTTP ${response.statusCode})`);
  }
  return true;
}

// YouTube Search Scraper to resolve track to YouTube link
async function searchYouTubeVideo(query) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  try {
    const response = await makeRequest(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8'
      }
    });

    if (response.statusCode === 200) {
      // Find first /watch?v=... that isn't related to channel or ads
      const regex = /\/watch\?v=([a-zA-Z0-9_-]{11})/g;
      let m;
      const matches = [];
      while ((m = regex.exec(response.body)) !== null) {
        matches.push(m[1]);
      }
      
      const unique = [...new Set(matches)];
      if (unique.length > 0) {
        return `https://www.youtube.com/watch?v=${unique[0]}`;
      }
    }
  } catch (err) {
    console.error('[SPOTIFY-YT] Error scraping YouTube:', err);
  }
  // Fallback to normal search url
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

module.exports = {
  loadSpotifyDb,
  saveSpotifyDb,
  getAuthUrl,
  exchangeCodeForTokens,
  getAccessToken,
  getProfile,
  getCurrentlyPlaying,
  getRecentlyPlayed,
  getTopTracks,
  getTopArtists,
  searchTrack,
  playTrack,
  addToQueue,
  searchYouTubeVideo
};
