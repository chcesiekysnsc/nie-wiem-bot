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
  
  // Przywróć timery dla sesji
  restoreTimers(client, sessions);
}

function restoreTimers(client, sessions) {
  const now = Date.now();
  
  // Przywróć timery dla rrRequests (rosyjska ruletka) - 2 minuty
  for (const [targetId, request] of sessions.rrRequests.entries()) {
    if (request.timestamp) {
      const elapsed = now - request.timestamp;
      const remaining = 120000 - elapsed; // 2 minuty
      if (remaining > 0) {
        setTimeout(() => {
          const active = client.rrRequests.get(targetId);
          if (active && active.challengerId === request.challengerId) {
            client.rrRequests.delete(targetId);
            saveGameSessions(client);
          }
        }, remaining);
      } else {
        // Timeout już minął - usuń sesję
        client.rrRequests.delete(targetId);
        saveGameSessions(client);
      }
    }
  }
  
  // Przywróć timery dla pknRequests - 2 minuty
  for (const [targetId, request] of sessions.pknRequests.entries()) {
    if (request.timestamp) {
      const elapsed = now - request.timestamp;
      const remaining = 120000 - elapsed; // 2 minuty
      if (remaining > 0) {
        setTimeout(() => {
          const active = client.pknRequests.get(targetId);
          if (active && active.challengerId === request.challengerId) {
            client.pknRequests.delete(targetId);
            saveGameSessions(client);
          }
        }, remaining);
      } else {
        client.pknRequests.delete(targetId);
        saveGameSessions(client);
      }
    }
  }
  
  // Przywróć timery dla duelRequests - 2 minuty
  for (const [targetId, request] of sessions.duelRequests.entries()) {
    if (request.timestamp) {
      const elapsed = now - request.timestamp;
      const remaining = 120000 - elapsed; // 2 minuty
      if (remaining > 0) {
        setTimeout(() => {
          const active = client.duelRequests.get(targetId);
          if (active && active.challengerId === request.challengerId) {
            client.duelRequests.delete(targetId);
            saveGameSessions(client);
          }
        }, remaining);
      } else {
        client.duelRequests.delete(targetId);
        saveGameSessions(client);
      }
    }
  }
  
  // Przywróć timery dla wojna lobby - 90 sekund
  for (const [threadId, session] of sessions.warSessions.entries()) {
    const wojnaCmd = require('../commands/wojna');
    if (session.state === 'lobby') {
      const elapsed = session.timestamp ? (now - session.timestamp) : 9999999;
      const remaining = 90000 - elapsed; // 90 sekund
      if (remaining > 0) {
        setTimeout(async () => {
          await wojnaCmd.resumeLobby(client, threadId);
        }, remaining);
      } else {
        // Timeout minął - rozstrzygnij lobby natychmiast
        wojnaCmd.resumeLobby(client, threadId).catch(e => console.error(e));
      }
    } else {
      // Gra w toku (game) lub jakikolwiek nieznany stan została przerwana restartem. Zwróć wpisowe wszystkim graczom i usuń sesję
      const { withData, createUser } = require('./storage');
      const { formatCurrency } = require('./economy');
      
      const bet = session.bet || 0;
      if (bet > 0) {
        withData(async store => {
          for (const pid of session.participants) {
            const user = createUser(pid, store.users);
            user.balance += bet;
          }
        }).catch(e => console.error('[gameStatePersistence] Błąd zwrotu wpisowego wojny:', e));
        
        if (client.api) {
          client.api.sendMessage(
            `🚨 **WOJNA KARCIANA:** Rozgrywka została przerwana przez restart bota.\n` +
            `💰 Wpisowe **${formatCurrency(bet)}** zostało zwrócone wszystkim uczestnikom do portfela.`,
            threadId
          ).catch(() => null);
        }
      }
      client.warSessions.delete(threadId);
      saveGameSessions(client);
    }
  }
  
  // Przywróć timery dla gielda lobby i investing - 2 minuty i 60 sekund
  for (const [threadId, session] of sessions.stockSessions.entries()) {
    const gieldaCmd = require('../commands/gielda');
    if (session.state === 'lobby') {
      const elapsed = session.timestamp ? (now - session.timestamp) : 9999999;
      const remaining = 120000 - elapsed; // 2 minuty
      if (remaining > 0) {
        setTimeout(async () => {
          await gieldaCmd.startInvesting(client, threadId);
        }, remaining);
      } else {
        // Lobby czas minął - rozpocznij inwestowanie natychmiast
        gieldaCmd.startInvesting(client, threadId).catch(e => console.error(e));
      }
    } else if (session.state === 'investing') {
      const elapsed = session.investStartTime ? (now - session.investStartTime) : 9999999;
      const remaining = 60000 - elapsed; // 60 sekund
      if (remaining > 0) {
        setTimeout(async () => {
          await gieldaCmd.resolveGielda(client, threadId);
        }, remaining);
      } else {
        // Czas na inwestowanie minął - rozstrzygnij giełdę natychmiast
        gieldaCmd.resolveGielda(client, threadId).catch(e => console.error(e));
      }
    } else {
      // Dla każdego innego stanu (resolving lub nieznany), awaryjnie rozstrzygnij giełdę natychmiast
      gieldaCmd.resolveGielda(client, threadId).catch(e => console.error(e));
    }
  }
  
  console.log('[GAME SESSIONS] Przywrócono timery dla sesji gier.');
}

module.exports = {
  saveGameSessions,
  loadGameSessions,
  restoreGameSessions
};
