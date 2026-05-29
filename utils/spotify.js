const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const SPOTIFY_DB_PATH = path.join(__dirname, '..', 'data', 'spotify.json');

// Helper do bezpiecznego ładowania bazy danych Spotify
function loadSpotifyDb() {
  try {
    if (fs.existsSync(SPOTIFY_DB_PATH)) {
      return JSON.parse(fs.readFileSync(SPOTIFY_DB_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('[SPOTIFY DB] Error loading:', err);
  }
  return { users: {} };
}

// Helper do zapisywania bazy danych Spotify
function saveSpotifyDb(db) {
  try {
    const dir = path.dirname(SPOTIFY_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SPOTIFY_DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('[SPOTIFY DB] Error saving:', err);
  }
}

// Helper do wysyłania zapytań HTTP
function makeRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url);
      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      const client = parsedUrl.protocol === 'https:' ? https : http;
      const req = client.request(reqOptions, (res) => {
        let responseData = '';
        res.on('data', chunk => { responseData += chunk; });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: responseData
          });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (body) {
        req.write(body);
      }
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

// Sprawdza czy zmienne środowiskowe do Spotify są skonfigurowane
function isConfigured() {
  return !!(
    process.env.SPOTIFY_CLIENT_ID &&
    process.env.SPOTIFY_CLIENT_SECRET &&
    process.env.SPOTIFY_REDIRECT_URI
  );
}

// Generuje link autoryzacyjny Spotify z zachowaniem ID użytkownika Messenger jako state
function getAuthUrl(userId) {
  if (!isConfigured()) return null;
  const scopes = [
    'user-read-currently-playing',
    'user-read-recently-played',
    'user-top-read',
    'user-modify-playback-state',
    'user-read-playback-state'
  ].join(' ');

  return `https://accounts.spotify.com/authorize?` +
    `client_id=${process.env.SPOTIFY_CLIENT_ID}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(process.env.SPOTIFY_REDIRECT_URI)}&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `state=${userId}`;
}

// Wymienia kod autoryzacji na tokeny
async function exchangeCode(code) {
  if (!isConfigured()) throw new Error('Brak konfiguracji Spotify w zmiennych środowiskowych.');

  const authHeader = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const body = `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(process.env.SPOTIFY_REDIRECT_URI)}`;

  const res = await makeRequest('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }, body);

  if (res.statusCode !== 200) {
    throw new Error(`Token exchange failed (HTTP ${res.statusCode}): ${res.body}`);
  }

  const tokenData = JSON.parse(res.body);
  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + (tokenData.expires_in * 1000)
  };
}

// Odświeża token dostępu użytkownika
async function refreshAccessToken(userId, refreshToken) {
  if (!isConfigured()) throw new Error('Brak konfiguracji Spotify.');

  const authHeader = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const body = `grant_type=refresh_token&refresh_token=${refreshToken}`;

  const res = await makeRequest('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }, body);

  if (res.statusCode !== 200) {
    throw new Error(`Token refresh failed (HTTP ${res.statusCode}): ${res.body}`);
  }

  const tokenData = JSON.parse(res.body);
  const db = loadSpotifyDb();
  
  db.users[userId] = db.users[userId] || {};
  db.users[userId].accessToken = tokenData.access_token;
  db.users[userId].expiresAt = Date.now() + (tokenData.expires_in * 1000);
  if (tokenData.refresh_token) {
    db.users[userId].refreshToken = tokenData.refresh_token;
  }
  
  saveSpotifyDb(db);
  return tokenData.access_token;
}

// Pobiera ważny token dostępu (odświeża go w razie potrzeby)
async function getAccessToken(userId) {
  const db = loadSpotifyDb();
  const userSpotify = db.users[userId];

  if (!userSpotify || !userSpotify.refreshToken) {
    throw new Error('Twoje konto Spotify nie jest połączone z botem. Wpisz `!spotify polacz` aby połączyć.');
  }

  // Jeśli wygasa za mniej niż 30 sekund lub już wygasł, odświeżamy
  if (Date.now() + 30000 >= userSpotify.expiresAt) {
    return await refreshAccessToken(userId, userSpotify.refreshToken);
  }

  return userSpotify.accessToken;
}

// Ogólny helper do zapytań Spotify API
async function spotifyRequest(userId, endpoint, method = 'GET', bodyData = null) {
  const token = await getAccessToken(userId);
  const url = `https://api.spotify.com/v1/${endpoint}`;
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  const body = bodyData ? JSON.stringify(bodyData) : null;
  const res = await makeRequest(url, { method, headers }, body);

  // Zwracaj parsed JSON jeśli status to 200/201/202, w przeciwnym razie jeśli pusty (np. 204 No Content) zwracaj null
  if (res.statusCode === 204) {
    return null;
  }

  if (res.statusCode >= 200 && res.statusCode < 300) {
    try {
      return JSON.parse(res.body);
    } catch (_) {
      return res.body;
    }
  }

  throw new Error(`Spotify API returned status ${res.statusCode}: ${res.body}`);
}

// ----------------------------------------------------
// IMPLEMENTACJA FUNKCJI SPOTIFY
// ----------------------------------------------------

// Pobiera profil użytkownika Spotify
async function getProfile(userId) {
  return await spotifyRequest(userId, 'me');
}

// Pobiera aktualnie odtwarzany utwór
async function getCurrentlyPlaying(userId) {
  return await spotifyRequest(userId, 'me/player/currently-playing');
}

// Pobiera ostatnio odtwarzane utwory (limit 5)
async function getRecentlyPlayed(userId) {
  return await spotifyRequest(userId, 'me/player/recently-played?limit=5');
}

// Pobiera najchętniej słuchane utwory (limit 5)
async function getTopTracks(userId, timeRange = 'medium_term') {
  // mapowanie 1m, 6m, 12m do formatu Spotify
  const rangeMap = {
    '1m': 'short_term',
    '6m': 'medium_term',
    '12m': 'long_term'
  };
  const spotifyRange = rangeMap[timeRange] || 'medium_term';
  return await spotifyRequest(userId, `me/top/tracks?limit=5&time_range=${spotifyRange}`);
}

// Pobiera najchętniej słuchanych artystów (limit 5)
async function getTopArtists(userId, timeRange = 'medium_term') {
  const rangeMap = {
    '1m': 'short_term',
    '6m': 'medium_term',
    '12m': 'long_term'
  };
  const spotifyRange = rangeMap[timeRange] || 'medium_term';
  return await spotifyRequest(userId, `me/top/artists?limit=5&time_range=${spotifyRange}`);
}

// Wyszukuje utwór w Spotify
async function searchTrack(userId, query) {
  const res = await spotifyRequest(userId, `search?q=${encodeURIComponent(query)}&type=track&limit=1`);
  if (res && res.tracks && res.tracks.items && res.tracks.items.length > 0) {
    return res.tracks.items[0];
  }
  return null;
}

// Dodaje utwór do kolejki
async function addToQueue(userId, trackUri) {
  await spotifyRequest(userId, `me/player/queue?uri=${encodeURIComponent(trackUri)}`, 'POST');
}

// Odtwarza dany utwór (startuje odtwarzanie)
async function playTrack(userId, trackUri) {
  const body = { uris: [trackUri] };
  await spotifyRequest(userId, 'me/player/play', 'PUT', body);
}

// Sprawdza czy użytkownik ma włączony tryb incognito
function isIncognito(userId) {
  const db = loadSpotifyDb();
  return !!(db.users[userId] && db.users[userId].incognito);
}

// Przełącza tryb incognito
function setIncognito(userId, value) {
  const db = loadSpotifyDb();
  db.users[userId] = db.users[userId] || {};
  db.users[userId].incognito = !!value;
  saveSpotifyDb(db);
}

// Odłącza konto Spotify
function disconnectUser(userId) {
  const db = loadSpotifyDb();
  if (db.users[userId]) {
    delete db.users[userId];
    saveSpotifyDb(db);
    return true;
  }
  return false;
}

module.exports = {
  isConfigured,
  getAuthUrl,
  exchangeCode,
  getAccessToken,
  spotifyRequest,
  getProfile,
  getCurrentlyPlaying,
  getRecentlyPlayed,
  getTopTracks,
  getTopArtists,
  searchTrack,
  addToQueue,
  playTrack,
  isIncognito,
  setIncognito,
  disconnectUser,
  loadSpotifyDb
};
