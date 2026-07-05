const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { loadData, withData, DATA_FILES } = require('../utils/storage');
const { getRegistry, getUserOverrides, saveUserOverrides } = require('../utils/chances');

const app = express();
const PORT = process.env.PANEL_PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== GRACZE =====
app.get('/api/players', (req, res) => {
  const users = loadData('users');
  const inventory = loadData('inventory');
  const profiles = loadData('profiles');
  const gangIndex = buildGangIndex(profiles);
  const blacklist = profiles.blacklist || [];
  const trueBlacklist = profiles.trueBlacklist || [];

  const search = String(req.query.search || '').toLowerCase().trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);

  let players = Object.entries(users)
    .filter(([, u]) => (u.commandsUsed || 0) >= 1)
    .map(([id, u]) => ({
    id,
    name: userName(u, id),
    balance: u.balance || 0,
    bank: u.bank || 0,
    level: u.level || 1,
    gang: gangIndex[id] ? gangIndex[id].name : null,
    commandsUsed: u.commandsUsed || 0,
    isMultiAccount: !!u.isMultiAccount,
    blacklisted: blacklist.includes(id),
    trueBlacklisted: trueBlacklist.includes(id),
    itemCount: Object.values(inventory[id] || {}).reduce((a, b) => a + b, 0),
    lastActiveThreadId: u.lastActiveThreadId || null
  }));

  if (search) {
    players = players.filter(p => p.id.includes(search) || p.name.toLowerCase().includes(search) || (p.gang || '').toLowerCase().includes(search));
  }

  players.sort((a, b) => (b.balance + b.bank) - (a.balance + a.bank));
  res.json({ total: players.length, players: players.slice(0, limit) });
});

app.get('/api/players/:id', (req, res) => {
  const users = loadData('users');
  const inventory = loadData('inventory');
  const profiles = loadData('profiles');
  const user = users[req.params.id];
  if (!user) return res.status(404).json({ error: 'Nie znaleziono gracza.' });
  const gangIndex = buildGangIndex(profiles);
  res.json({
    id: req.params.id,
    name: userName(user, req.params.id),
    user,
    inventory: inventory[req.params.id] || {},
    gang: gangIndex[req.params.id] || null,
    blacklisted: (profiles.blacklist || []).includes(req.params.id),
    trueBlacklisted: (profiles.trueBlacklist || []).includes(req.params.id)
  });
});

app.post('/api/players/:id', async (req, res) => {
  const { balance, bank, level, items, addItem } = req.body || {};
  try {
    const result = await withData(store => {
      const user = store.users[req.params.id];
      if (!user) return { error: 'Nie znaleziono gracza.' };
      if (balance !== undefined) user.balance = Math.floor(Number(balance)) || 0;
      if (bank !== undefined) user.bank = Math.max(0, Math.floor(Number(bank)) || 0);
      if (level !== undefined) user.level = Math.max(1, Math.floor(Number(level)) || 1);
      
      // Obsługa dodawania przedmiotów po ID
      if (addItem && typeof addItem === 'object' && addItem.itemId && addItem.quantity) {
        store.inventory[req.params.id] = store.inventory[req.params.id] || {};
        const itemId = String(addItem.itemId).trim();
        const quantity = Math.max(1, Math.floor(Number(addItem.quantity)) || 1);
        store.inventory[req.params.id][itemId] = (store.inventory[req.params.id][itemId] || 0) + quantity;
      }
      
      // Obsługa edycji przedmiotów
      if (items && typeof items === 'object') {
        store.inventory[req.params.id] = store.inventory[req.params.id] || {};
        for (const [itemId, qty] of Object.entries(items)) {
          const amount = Math.max(0, Math.floor(Number(qty)) || 0);
          if (amount === 0) {
            delete store.inventory[req.params.id][itemId];
          } else {
            store.inventory[req.params.id][itemId] = amount;
          }
        }
      }
      return { ok: true };
    });
    if (result.error) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== SZANSE =====
app.get('/api/chances/:id', async (req, res) => {
  try {
    const registry = getChancesRegistry();
    const overrides = await getUserOverrides(req.params.id);
    const chances = Object.values(registry).map(entry => ({
      id: entry.id,
      label: entry.label,
      description: entry.description,
      unit: entry.unit,
      category: entry.category,
      min: entry.min,
      max: entry.max,
      step: entry.step || 1,
      default: entry.default,
      current: overrides && overrides[entry.id] !== undefined && overrides[entry.id] !== null && overrides[entry.id] !== ''
        ? Number(overrides[entry.id])
        : entry.default
    }));
    res.json({ chances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chances/:id', async (req, res) => {
  const { chances } = req.body || {};
  if (!chances || typeof chances !== 'object') {
    return res.status(400).json({ error: 'Wymagane pole: chances.' });
  }
  try {
    const registry = getChancesRegistry();
    const cleaned = {};
    for (const entry of Object.values(registry)) {
      if (chances[entry.id] !== undefined && chances[entry.id] !== null && chances[entry.id] !== '') {
        const v = Number(chances[entry.id]);
        if (!Number.isFinite(v)) continue;
        cleaned[entry.id] = Math.min(entry.max, Math.max(entry.min, v));
      }
    }
    await saveUserOverrides(req.params.id, cleaned);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== BANY =====
app.get('/api/bans', (req, res) => {
  const users = loadData('users');
  const profiles = loadData('profiles');
  const nameOf = id => userName(users[id], id);
  res.json({
    blacklist: (profiles.blacklist || []).map(id => ({ id, name: nameOf(id) })),
    trueBlacklist: (profiles.trueBlacklist || []).map(id => ({ id, name: nameOf(id) })),
    multiAccounts: Object.entries(users).filter(([, u]) => u && u.isMultiAccount).map(([id, u]) => ({ id, name: userName(u, id) })),
    blacklistedGroups: (profiles.blacklistedGroups || []).map(id => ({ id }))
  });
});

app.post('/api/bans/remove', async (req, res) => {
  const { type, id } = req.body || {};
  if (!type || !id) return res.status(400).json({ error: 'Wymagane pola: type, id.' });
  try {
    const result = await withData(store => {
      if (type === 'blacklist') {
        store.profiles.blacklist = (store.profiles.blacklist || []).filter(x => x !== id);
        if (store.users[id]) store.users[id].blacklistedForNegativeBalance = false;
      } else if (type === 'trueBlacklist') {
        store.profiles.trueBlacklist = (store.profiles.trueBlacklist || []).filter(x => x !== id);
      } else if (type === 'multiAccount') {
        if (!store.users[id]) return { error: 'Nie znaleziono gracza.' };
        store.users[id].isMultiAccount = false;
        delete store.users[id].unblockMessageTarget;
      } else if (type === 'group') {
        store.profiles.blacklistedGroups = (store.profiles.blacklistedGroups || []).filter(x => x !== id);
      } else {
        return { error: 'Nieznany typ blokady.' };
      }
      return { ok: true };
    });
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== LOGI =====
app.get('/api/logs', (req, res) => {
  const logs = loadData('logs');
  const users = loadData('users');
  const userFilter = String(req.query.user || '').toLowerCase().trim();
  const commandFilter = String(req.query.command || '').toLowerCase().trim();
  const from = req.query.from ? new Date(req.query.from).getTime() : null;
  const to = req.query.to ? new Date(req.query.to).getTime() + 24 * 60 * 60 * 1000 : null;
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 2000);

  let filtered = logs.filter(entry => {
    const ts = new Date(entry.timestamp).getTime();
    if (from && ts < from) return false;
    if (to && ts >= to) return false;
    if (commandFilter && !(entry.command || '').toLowerCase().includes(commandFilter)) return false;
    if (userFilter) {
      const name = (entry.userName || userName(users[entry.userId], entry.userId || '')).toLowerCase();
      if (!(entry.userId || '').includes(userFilter) && !name.includes(userFilter)) return false;
    }
    return true;
  });

  res.json({ total: filtered.length, logs: filtered.slice(0, limit) });
});

app.get('/api/logs/activity', (req, res) => {
  const logs = loadData('logs');
  const days = Math.min(parseInt(req.query.days, 10) || 14, 60);
  const counts = {};
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    counts[d.toISOString().slice(0, 10)] = 0;
  }
  for (const entry of logs) {
    const day = String(entry.timestamp || '').slice(0, 10);
    if (day in counts) counts[day]++;
  }
  res.json({ activity: Object.entries(counts).map(([day, count]) => ({ day, count })) });
});

// ===== GANGI =====
app.get('/api/gangs', (req, res) => {
  const users = loadData('users');
  const profiles = loadData('profiles');
  const gangs = Object.entries(profiles.gangs || {}).map(([id, gang]) => ({
    id,
    name: gang.name,
    vault: gang.vault || 0,
    tributePercent: gang.tributePercent || 0,
    levelDziupla: gang.levelDziupla || 0,
    levelBiznesy: gang.levelBiznesy || 0,
    levelFach: gang.levelFach || 0,
    boss: { id: gang.bossId, name: userName(users[gang.bossId], gang.bossId) },
    deputies: (gang.deputies || []).map(mid => ({ id: mid, name: userName(users[mid], mid) })),
    members: (gang.members || []).map(mid => ({ id: mid, name: userName(users[mid], mid) })),
    alliances: gang.alliances || []
  }));
  res.json({ gangs });
});

app.post('/api/gangs/:id', async (req, res) => {
  const { vault, tributePercent, removeMember, deleteGang } = req.body || {};
  try {
    const result = await withData(store => {
      const gang = (store.profiles.gangs || {})[req.params.id];
      if (!gang) return { error: 'Nie znaleziono gangu.' };
      if (deleteGang) {
        delete store.profiles.gangs[req.params.id];
        for (const other of Object.values(store.profiles.gangs)) {
          if (Array.isArray(other.alliances)) {
            other.alliances = other.alliances.filter(a => a !== req.params.id);
          }
        }
        return { ok: true };
      }
      if (vault !== undefined) gang.vault = Math.max(0, Math.floor(Number(vault)) || 0);
      if (tributePercent !== undefined) gang.tributePercent = Math.min(100, Math.max(0, Math.floor(Number(tributePercent)) || 0));
      if (removeMember) {
        gang.members = (gang.members || []).filter(m => m !== removeMember);
        gang.deputies = (gang.deputies || []).filter(m => m !== removeMember);
      }
      return { ok: true };
    });
    if (result.error) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== LIVE / STATUS =====
app.get('/api/status', (req, res) => {
  const users = loadData('users');
  const profiles = loadData('profiles');
  const logs = loadData('logs');
  const botStatus = profiles.botStatus || null;
  const online = !!(botStatus && botStatus.lastHeartbeat && Date.now() - botStatus.lastHeartbeat < 60 * 1000);

  const fileInfo = {};
  for (const [key, filePath] of Object.entries(DATA_FILES)) {
    try {
      const stat = fs.statSync(filePath);
      fileInfo[key] = { size: stat.size, modified: stat.mtime.toISOString() };
    } catch (_) {
      fileInfo[key] = null;
    }
  }

  res.json({
    online,
    botStatus,
    counts: {
      users: Object.values(users).filter(u => (u.commandsUsed || 0) >= 1).length,
      gangs: Object.keys(profiles.gangs || {}).length,
      logs: logs.length,
      blacklisted: (profiles.blacklist || []).length + (profiles.trueBlacklist || []).length
    },
    files: fileInfo,
    pendingBroadcasts: (profiles.pendingAdminBroadcasts || []).length
  });
});

app.post('/api/broadcast', async (req, res) => {
  const { message } = req.body || {};
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'Treść ogłoszenia nie może być pusta.' });
  try {
    await withData(store => {
      store.profiles.pendingAdminBroadcasts = store.profiles.pendingAdminBroadcasts || [];
      store.profiles.pendingAdminBroadcasts.push({ message: String(message).trim().slice(0, 2000), createdAt: Date.now() });
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== USTAWIENIA =====
app.get('/api/settings', (req, res) => {
  const profiles = loadData('profiles');
  const groupStats = loadData('groupStats');
  const config = require('../config/config');
  
  // Pobierz WSZYSTKIE cooldowny z config
  const allCooldowns = { ...config.cooldowns };
  
  // Dodaj custom cooldowny
  const customCooldowns = profiles.customCooldowns || {};
  
  // Pobierz WSZYSTKIE podatki
  const taxForms = {
    balanceTax: profiles.balanceTaxRate || 4,
    transferTax: profiles.transferTaxRate || 5,
    marketTax: profiles.marketTaxRate || 10,
    gangTribute: profiles.gangTributeRate || 0,
    casinoTax: profiles.casinoTaxRate || 15,
    meczTax: profiles.meczTaxRate || 15
  };
  
  // Pobierz WSZYSTKIE prefixy grup z threadSettings (to samo źródło co bot i komenda !prefix)
  const threadSettings = profiles.threadSettings || {};
  const groupPrefixes = {};
  for (const [tid, ts] of Object.entries(threadSettings)) {
    if (ts.prefix) groupPrefixes[tid] = ts.prefix;
  }
  
  let groups = [];
  try {
    const threadsPath = path.join(__dirname, '..', 'data', 'active_threads.json');
    if (fs.existsSync(threadsPath)) {
      const threadIds = JSON.parse(fs.readFileSync(threadsPath, 'utf8'));
      if (Array.isArray(threadIds)) {
        groups = threadIds.map(id => {
          const stats = groupStats[id] || {};
          return { id, name: stats.threadName || null };
        });
      }
    }
  } catch (_) {}
  
  res.json({
    groups,
    allCooldowns,
    customCooldowns,
    taxForms,
    customTaxes: profiles.customTaxes || {},
    groupPrefixes
  });
});

app.post('/api/settings', async (req, res) => {
  const { allCooldowns, customCooldowns, taxForms, groupPrefixes } = req.body || {};
  try {
    await withData(store => {
      // Zapisz cooldowny
      if (allCooldowns && typeof allCooldowns === 'object') {
        const config = require('../config/config');
        for (const [key, value] of Object.entries(allCooldowns)) {
          if (key in config.cooldowns) {
            config.cooldowns[key] = Math.max(0, parseInt(value) || 0);
          }
        }
        // Zapisz custom cooldowny
        store.profiles.customCooldowns = customCooldowns || {};
      }
      
      // Zapisz podatki
      if (taxForms && typeof taxForms === 'object') {
        if (taxForms.balanceTax !== undefined) store.profiles.balanceTaxRate = parseFloat(taxForms.balanceTax);
        if (taxForms.transferTax !== undefined) store.profiles.transferTaxRate = parseFloat(taxForms.transferTax);
        if (taxForms.marketTax !== undefined) store.profiles.marketTaxRate = parseFloat(taxForms.marketTax);
        if (taxForms.gangTribute !== undefined) store.profiles.gangTributeRate = parseFloat(taxForms.gangTribute);
        if (taxForms.casinoTax !== undefined) store.profiles.casinoTaxRate = parseFloat(taxForms.casinoTax);
        if (taxForms.meczTax !== undefined) store.profiles.meczTaxRate = parseFloat(taxForms.meczTax);
      }
      
      // Zapisz prefixy grup do threadSettings (to samo źródło co bot i komenda !prefix)
      if (groupPrefixes && typeof groupPrefixes === 'object') {
        store.profiles.threadSettings = store.profiles.threadSettings || {};
        for (const [groupId, prefix] of Object.entries(groupPrefixes)) {
          store.profiles.threadSettings[groupId] = store.profiles.threadSettings[groupId] || {};
          store.profiles.threadSettings[groupId].prefix = prefix;
        }
      }
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== EVENTY =====
app.get('/api/events', (req, res) => {
  const profiles = loadData('profiles');
  const events = (profiles.events || []).filter(e => e.endTime > Date.now());
  res.json({ events });
});

app.post('/api/events', async (req, res) => {
  const { type, multiplier, cooldownReductionPercent, durationMinutes, description } = req.body || {};
  if (!type || !multiplier || !durationMinutes) {
    return res.status(400).json({ error: 'Wymagane pola: type, multiplier, durationMinutes.' });
  }
  const allowedTypes = ['xp', 'casino', 'items', 'cooldowns'];
  if (!allowedTypes.includes(type)) {
    return res.status(400).json({ error: 'Nieznany typ eventu.' });
  }

  const parsedMultiplier = parseFloat(multiplier);
  const parsedDuration = parseInt(durationMinutes, 10);
  if (!Number.isFinite(parsedMultiplier) || parsedMultiplier <= 0 || !Number.isFinite(parsedDuration) || parsedDuration <= 0) {
    return res.status(400).json({ error: 'Nieprawidłowy mnożnik lub czas trwania.' });
  }

  const parsedReduction = type === 'cooldowns'
    ? Math.min(90, Math.max(1, Math.round(Number(cooldownReductionPercent) || ((1 - (1 / parsedMultiplier)) * 100))))
    : null;

  try {
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      multiplier: parsedMultiplier,
      ...(parsedReduction != null ? { reductionPercent: parsedReduction } : {}),
      endTime: Date.now() + parsedDuration * 60 * 1000,
      description: String(description || '').trim().slice(0, 200),
      createdAt: Date.now()
    };
    await withData(store => {
      store.profiles.events = store.profiles.events || [];
      // Wyczyść wygasłe eventy
      store.profiles.events = store.profiles.events.filter(e => e.endTime > Date.now());
      store.profiles.events.push(event);
    });
    
    // Wyślij powiadomienie o starcie eventu na wszystkie aktywne grupy
    try {
      const threadsPath = path.join(__dirname, '..', 'data', 'active_threads.json');
      if (fs.existsSync(threadsPath)) {
        const threadIds = JSON.parse(fs.readFileSync(threadsPath, 'utf8'));
        const typeNames = { xp: '⚡ XP', casino: '🎰 Kasyno', items: '📦 Itemy', cooldowns: '⚡ Szybsze cooldowny' };
        const durationStr = parsedDuration >= 60 
          ? `${Math.floor(parsedDuration / 60)}h ${parsedDuration % 60}min`
          : `${parsedDuration} min`;
        const bonusLine = type === 'cooldowns'
          ? `⚡ Skrócenie cooldownów: **-${parsedReduction}%**\n`
          : `🔥 Mnożnik: **x${parsedMultiplier}**\n`;
        const notifyMsg = `🎉 **NOWY EVENT AKTYWNY!** 🎉\n\n` +
          `📋 Typ: **${typeNames[type] || type}**\n` +
          bonusLine +
          `⏱️ Czas trwania: **${durationStr}**\n` +
          (description ? `📝 ${description}\n` : '') +
          `\n💪 Korzystajcie z bonusów!`;
        
        if (Array.isArray(threadIds) && global.botApi) {
          for (const tId of threadIds) {
            global.botApi.sendMessage(notifyMsg, tId);
          }
        }
      }
    } catch (notifyErr) {
      console.error('[EVENTS] Failed to broadcast event start:', notifyErr);
    }
    res.json({ ok: true, event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    await withData(store => {
      store.profiles.events = (store.profiles.events || []).filter(e => e.id !== req.params.id);
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/restart', async (req, res) => {
  try {
    await withData(store => {
      store.profiles.pendingAdminRestart = true;
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Panel administratora działa na http://localhost:${PORT}`);
  });
} else {
  module.exports = app;
}
