const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const GAME_SESSIONS_FILE = path.join(DATA_DIR, 'game_sessions.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function serializeMap(map) {
  if (!map) return undefined;
  const obj = {};
  for (const [key, value] of map.entries()) {
    obj[key] = value;
  }
  return obj;
}

function deserializeMap(obj) {
  if (!obj) return new Map();
  const map = new Map();
  for (const [key, value] of Object.entries(obj)) {
    map.set(key, value);
  }
  return map;
}

function serializeSet(set) {
  if (!set) return undefined;
  return Array.from(set);
}

function deserializeSet(arr) {
  if (!Array.isArray(arr)) return new Set();
  return new Set(arr);
}

function serializeValue(value) {
  if (value instanceof Map) return { __type: 'Map', data: serializeMap(value) };
  if (value instanceof Set) return { __type: 'Set', data: serializeSet(value) };
  if (value instanceof Date) return { __type: 'Date', data: value.toISOString() };
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === 'object') {
    const obj = {};
    for (const [k, v] of Object.entries(value)) {
      obj[k] = serializeValue(v);
    }
    return obj;
  }
  return value;
}

function deserializeValue(value) {
  if (value && typeof value === 'object' && value.__type === 'Map') {
    return deserializeMap(value.data);
  }
  if (value && typeof value === 'object' && value.__type === 'Set') {
    return deserializeSet(value.data);
  }
  if (value && typeof value === 'object' && value.__type === 'Date') {
    return new Date(value.data);
  }
  if (Array.isArray(value)) return value.map(deserializeValue);
  if (value && typeof value === 'object') {
    const obj = {};
    for (const [k, v] of Object.entries(value)) {
      obj[k] = deserializeValue(v);
    }
    return obj;
  }
  return value;
}

function serializeSessions(sessions) {
  const data = {};
  for (const [key, session] of sessions.entries()) {
    data[key] = serializeValue(session);
  }
  return data;
}

function deserializeSessions(data) {
  if (!data || typeof data !== 'object') return new Map();
  const map = new Map();
  for (const [key, value] of Object.entries(data)) {
    map.set(key, deserializeValue(value));
  }
  return map;
}

function saveGameSessions(client) {
  try {
    ensureDataDir();
    const data = {
      activeBlackjackGames: serializeSessions(client.activeBlackjackGames || new Map()),
      activeChickenRoadGames: serializeSessions(client.activeChickenRoadGames || new Map()),
      stockSessions: serializeSessions(client.stockSessions || new Map()),
      warSessions: serializeSessions(client.warSessions || new Map()),
      rrRequests: serializeSessions(client.rrRequests || new Map()),
      pknRequests: serializeSessions(client.pknRequests || new Map()),
      duelRequests: serializeSessions(client.duelRequests || new Map()),
      activeMatches: serializeSessions(client.activeMatches || new Map()),
      meczInProgress: serializeValue(client.meczInProgress || new Set()),
      activeMeczTimers: serializeSessions(client.activeMeczTimers || new Map()),
      activeMultiMatches: serializeSessions(client.activeMultiMatches || new Map())
    };
    fs.writeFileSync(GAME_SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[gameStatePersistence] Failed to save game sessions:', err);
  }
}

function loadGameSessions() {
  try {
    if (!fs.existsSync(GAME_SESSIONS_FILE)) {
      return {
        activeBlackjackGames: new Map(),
        activeChickenRoadGames: new Map(),
        stockSessions: new Map(),
        warSessions: new Map(),
        rrRequests: new Map(),
        pknRequests: new Map(),
        duelRequests: new Map(),
        activeMatches: new Map(),
        meczInProgress: new Set(),
        activeMeczTimers: new Map(),
        activeMultiMatches: new Map()
      };
    }
    const raw = fs.readFileSync(GAME_SESSIONS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return {
      activeBlackjackGames: deserializeSessions(data.activeBlackjackGames),
      activeChickenRoadGames: deserializeSessions(data.activeChickenRoadGames),
      stockSessions: deserializeSessions(data.stockSessions),
      warSessions: deserializeSessions(data.warSessions),
      rrRequests: deserializeSessions(data.rrRequests),
      pknRequests: deserializeSessions(data.pknRequests),
      duelRequests: deserializeSessions(data.duelRequests),
      activeMatches: deserializeSessions(data.activeMatches),
      meczInProgress: deserializeValue(data.meczInProgress),
      activeMeczTimers: deserializeSessions(data.activeMeczTimers),
      activeMultiMatches: deserializeSessions(data.activeMultiMatches)
    };
  } catch (err) {
    console.error('[gameStatePersistence] Failed to load game sessions:', err);
    return {
      activeBlackjackGames: new Map(),
      activeChickenRoadGames: new Map(),
      stockSessions: new Map(),
      warSessions: new Map(),
      rrRequests: new Map(),
      pknRequests: new Map(),
      duelRequests: new Map(),
      activeMatches: new Map(),
      meczInProgress: new Set(),
      activeMeczTimers: new Map(),
      activeMultiMatches: new Map()
    };
  }
}

function restoreGameSessions(client, sessions) {
  client.activeBlackjackGames = sessions.activeBlackjackGames || new Map();
  client.activeChickenRoadGames = sessions.activeChickenRoadGames || new Map();
  client.stockSessions = sessions.stockSessions || new Map();
  client.warSessions = sessions.warSessions || new Map();
  client.rrRequests = sessions.rrRequests || new Map();
  client.pknRequests = sessions.pknRequests || new Map();
  client.duelRequests = sessions.duelRequests || new Map();
  client.activeMatches = sessions.activeMatches || new Map();
  client.meczInProgress = sessions.meczInProgress || new Set();
  client.activeMeczTimers = sessions.activeMeczTimers || new Map();
  client.activeMultiMatches = sessions.activeMultiMatches || new Map();
}

module.exports = {
  saveGameSessions,
  loadGameSessions,
  restoreGameSessions
};
