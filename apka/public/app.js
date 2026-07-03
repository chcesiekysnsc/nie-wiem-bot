let token = localStorage.getItem('panelToken') || null;

const $ = sel => document.querySelector(sel);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n || 0).toLocaleString('pl-PL');

function toast(msg, isError) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = isError ? 'error-toast' : 'ok-toast';
  setTimeout(() => { el.className = 'hidden'; }, 3500);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    logout(false);
    throw new Error('Sesja wygasła. Zaloguj się ponownie.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Błąd ${res.status}`);
  return data;
}

function showLogin() {
  $('#login-view').classList.remove('hidden');
  $('#panel-view').classList.add('hidden');
}

function showPanel() {
  $('#login-view').classList.add('hidden');
  $('#panel-view').classList.remove('hidden');
  loadPlayers();
  refreshStatusBadge();
}

function logout(callApi = true) {
  if (callApi && token) api('/api/logout', { method: 'POST' }).catch(() => {});
  token = null;
  localStorage.removeItem('panelToken');
  showLogin();
}

$('#login-btn').addEventListener('click', async () => {
  $('#login-error').textContent = '';
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ login: $('#login-user').value, password: $('#login-pass').value })
    });
    token = data.token;
    localStorage.setItem('panelToken', token);
    showPanel();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});
$('#login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') $('#login-btn').click(); });
$('#logout-btn').addEventListener('click', () => logout(true));

// ===== ZAKŁADKI =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab').forEach(t => t.classList.add('hidden'));
    $(`#tab-${btn.dataset.tab}`).classList.remove('hidden');
    if (btn.dataset.tab === 'players') loadPlayers();
    if (btn.dataset.tab === 'bans') loadBans();
    if (btn.dataset.tab === 'logs') { loadLogs(); loadActivity(); }
    if (btn.dataset.tab === 'gangs') loadGangs();
    if (btn.dataset.tab === 'live') loadLive();
  });
});

// ===== GRACZE =====
let searchTimer = null;
$('#player-search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadPlayers, 300);
});

async function loadPlayers() {
  try {
    const search = encodeURIComponent($('#player-search').value.trim());
    const data = await api(`/api/players?search=${search}&limit=200`);
    $('#player-count').textContent = `Znaleziono: ${data.total}`;
    const tbody = $('#players-table tbody');
    tbody.innerHTML = data.players.map(p => `
      <tr>
        <td>${esc(p.name)}</td>
        <td class="muted">${esc(p.id)}</td>
        <td>${fmt(p.balance)}</td>
        <td>${fmt(p.bank)}</td>
        <td>${p.level}</td>
        <td>${esc(p.gang || '—')}</td>
        <td>${fmt(p.commandsUsed)}</td>
        <td>${fmt(p.itemCount)}</td>
        <td>${p.trueBlacklisted ? '<span class="badge offline">TrueBL</span>' : ''}${p.blacklisted ? '<span class="badge offline">BL</span>' : ''}${p.isMultiAccount ? '<span class="badge warn">Multi</span>' : ''}</td>
        <td><button class="small" onclick="openPlayer('${esc(p.id)}')">Edytuj</button></td>
      </tr>`).join('');
  } catch (err) { toast(err.message, true); }
}

window.openPlayer = async function (id) {
  try {
    const data = await api(`/api/players/${encodeURIComponent(id)}`);
    const items = Object.entries(data.inventory);
    $('#modal').innerHTML = `
      <h3>✏️ ${esc(data.name)} <span class="muted">(${esc(id)})</span></h3>
      <label>Saldo <input type="number" id="edit-balance" value="${data.user.balance || 0}"></label>
      <label>Bank <input type="number" id="edit-bank" value="${data.user.bank || 0}"></label>
      <label>Poziom <input type="number" id="edit-level" value="${data.user.level || 1}"></label>
      <h4>Ekwipunek</h4>
      <div id="edit-items">
        ${items.length ? items.map(([itemId, qty]) => `
          <label class="item-row">${esc(itemId)} <input type="number" min="0" data-item="${esc(itemId)}" value="${qty}"></label>`).join('') : '<p class="muted">Brak przedmiotów</p>'}
      </div>
      <label class="item-row">➕ Dodaj item (ID) <input type="text" id="new-item-id" placeholder="np. czarna_karta"> <input type="number" id="new-item-qty" min="1" value="1"></label>
      <div class="modal-actions">
        <button onclick="savePlayer('${esc(id)}')">Zapisz</button>
        <button class="secondary" onclick="closeModal()">Anuluj</button>
      </div>`;
    $('#modal-overlay').classList.remove('hidden');
  } catch (err) { toast(err.message, true); }
};

window.savePlayer = async function (id) {
  try {
    const items = {};
    document.querySelectorAll('#edit-items input[data-item]').forEach(inp => {
      items[inp.dataset.item] = parseInt(inp.value, 10) || 0;
    });
    const newItemId = $('#new-item-id').value.trim();
    if (newItemId) items[newItemId] = parseInt($('#new-item-qty').value, 10) || 1;
    await api(`/api/players/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({
        balance: $('#edit-balance').value,
        bank: $('#edit-bank').value,
        level: $('#edit-level').value,
        items
      })
    });
    closeModal();
    toast('Zapisano zmiany gracza.');
    loadPlayers();
  } catch (err) { toast(err.message, true); }
};

window.closeModal = function () { $('#modal-overlay').classList.add('hidden'); };
$('#modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') closeModal(); });

// ===== BANY =====
async function loadBans() {
  try {
    const data = await api('/api/bans');
    const render = (list, type) => list.length
      ? list.map(e => `<li>${esc(e.name || e.id)} <span class="muted">${e.name ? esc(e.id) : ''}</span> <button class="small danger" onclick="removeBan('${type}','${esc(e.id)}')">Zdejmij</button></li>`).join('')
      : '<li class="muted">Pusto</li>';
    $('#ban-blacklist').innerHTML = render(data.blacklist, 'blacklist');
    $('#ban-trueblacklist').innerHTML = render(data.trueBlacklist, 'trueBlacklist');
    $('#ban-multiaccounts').innerHTML = render(data.multiAccounts, 'multiAccount');
    $('#ban-groups').innerHTML = render(data.blacklistedGroups, 'group');
  } catch (err) { toast(err.message, true); }
}

window.removeBan = async function (type, id) {
  try {
    await api('/api/bans/remove', { method: 'POST', body: JSON.stringify({ type, id }) });
    toast('Blokada zdjęta.');
    loadBans();
  } catch (err) { toast(err.message, true); }
};

// ===== LOGI =====
$('#log-filter-btn').addEventListener('click', loadLogs);

async function loadLogs() {
  try {
    const params = new URLSearchParams({
      user: $('#log-user').value.trim(),
      command: $('#log-command').value.trim(),
      from: $('#log-from').value,
      to: $('#log-to').value,
      limit: 300
    });
    const data = await api(`/api/logs?${params}`);
    $('#log-count').textContent = `Wpisów: ${data.total}`;
    $('#logs-table tbody').innerHTML = data.logs.length ? data.logs.map(l => `
      <tr>
        <td>${esc(new Date(l.timestamp).toLocaleString('pl-PL'))}</td>
        <td>${esc(l.userName || l.userId || '—')}</td>
        <td><code>!${esc(l.command || l.type || '')}</code></td>
        <td class="muted">${esc(l.args || '')}</td>
        <td class="muted">${esc(l.threadId || '')}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="muted">Brak wpisów (logi zbierane są od momentu aktualizacji bota)</td></tr>';
  } catch (err) { toast(err.message, true); }
}

async function loadActivity() {
  try {
    const data = await api('/api/logs/activity?days=14');
    const max = Math.max(1, ...data.activity.map(a => a.count));
    $('#activity-chart').innerHTML = data.activity.map(a => `
      <div class="bar-col" title="${a.day}: ${a.count}">
        <div class="bar" style="height:${Math.round((a.count / max) * 100)}%"></div>
        <span class="bar-label">${a.day.slice(5)}</span>
        <span class="bar-value">${a.count}</span>
      </div>`).join('');
  } catch (err) { toast(err.message, true); }
}

// ===== GANGI =====
async function loadGangs() {
  try {
    const data = await api('/api/gangs');
    $('#gangs-list').innerHTML = data.gangs.length ? data.gangs.map(g => `
      <div class="card">
        <h3>🔫 ${esc(g.name)} <span class="muted">(${esc(g.id)})</span></h3>
        <p>👑 Szef: <b>${esc(g.boss.name)}</b> | Zastępcy: ${g.deputies.map(d => esc(d.name)).join(', ') || '—'}</p>
        <p>🏚️ Dziupla: ${g.levelDziupla} | 💼 Biznesy: ${g.levelBiznesy} | 🛠️ Fach: ${g.levelFach} | 🤝 Sojusze: ${g.alliances.map(esc).join(', ') || '—'}</p>
        <div class="gang-edit">
          <label>Sejf <input type="number" id="gang-vault-${esc(g.id)}" value="${g.vault}"></label>
          <label>Haracz % <input type="number" min="0" max="100" id="gang-tribute-${esc(g.id)}" value="${g.tributePercent}"></label>
          <button class="small" onclick="saveGang('${esc(g.id)}')">Zapisz</button>
          <button class="small danger" onclick="deleteGang('${esc(g.id)}','${esc(g.name)}')">Usuń gang</button>
        </div>
        <details>
          <summary>Członkowie (${g.members.length})</summary>
          <ul>${g.members.map(m => `<li>${esc(m.name)} <span class="muted">${esc(m.id)}</span> ${m.id !== g.boss.id ? `<button class="small danger" onclick="kickMember('${esc(g.id)}','${esc(m.id)}')">Wyrzuć</button>` : '<span class="badge warn">Szef</span>'}</li>`).join('')}</ul>
        </details>
      </div>`).join('') : '<p class="muted">Brak gangów.</p>';
  } catch (err) { toast(err.message, true); }
}

window.saveGang = async function (id) {
  try {
    await api(`/api/gangs/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({
        vault: document.getElementById(`gang-vault-${id}`).value,
        tributePercent: document.getElementById(`gang-tribute-${id}`).value
      })
    });
    toast('Zapisano gang.');
    loadGangs();
  } catch (err) { toast(err.message, true); }
};

window.kickMember = async function (gangId, memberId) {
  if (!confirm('Wyrzucić tego członka z gangu?')) return;
  try {
    await api(`/api/gangs/${encodeURIComponent(gangId)}`, { method: 'POST', body: JSON.stringify({ removeMember: memberId }) });
    toast('Wyrzucono członka.');
    loadGangs();
  } catch (err) { toast(err.message, true); }
};

window.deleteGang = async function (gangId, name) {
  if (!confirm(`Na pewno usunąć gang ${name}? Tej operacji nie można cofnąć.`)) return;
  try {
    await api(`/api/gangs/${encodeURIComponent(gangId)}`, { method: 'POST', body: JSON.stringify({ deleteGang: true }) });
    toast('Gang usunięty.');
    loadGangs();
  } catch (err) { toast(err.message, true); }
};

// ===== LIVE =====
async function loadLive() {
  try {
    const data = await api('/api/status');
    const bs = data.botStatus || {};
    $('#live-status').innerHTML = `
      <h3>📡 Status bota</h3>
      <p>Status: ${data.online ? '<span class="badge online">ONLINE</span>' : '<span class="badge offline">OFFLINE</span>'}</p>
      <p>Zalogowany jako: <b>${esc(bs.botId || '—')}</b> | Aktywne grupy: <b>${bs.activeThreads != null ? bs.activeThreads : '—'}</b></p>
      <p>Ostatni sygnał życia: <b>${bs.lastHeartbeat ? new Date(bs.lastHeartbeat).toLocaleString('pl-PL') : 'brak (bot wymaga aktualizacji lub nie działa)'}</b></p>
      <p>Gracze: <b>${fmt(data.counts.users)}</b> | Gangi: <b>${fmt(data.counts.gangs)}</b> | Wpisy logów: <b>${fmt(data.counts.logs)}</b> | Zablokowani: <b>${fmt(data.counts.blacklisted)}</b></p>
      <p class="muted">Oczekujące ogłoszenia: ${data.pendingBroadcasts}</p>`;
    refreshStatusBadge(data);
  } catch (err) { toast(err.message, true); }
}

async function refreshStatusBadge(data) {
  try {
    if (!data) data = await api('/api/status');
    const badge = $('#bot-status-badge');
    badge.textContent = data.online ? 'Bot: ONLINE' : 'Bot: OFFLINE';
    badge.className = `badge ${data.online ? 'online' : 'offline'}`;
  } catch (_) {}
}

$('#broadcast-btn').addEventListener('click', async () => {
  const message = $('#broadcast-msg').value.trim();
  if (!message) return toast('Wpisz treść ogłoszenia.', true);
  if (!confirm('Wysłać ogłoszenie na wszystkie aktywne grupy?')) return;
  try {
    await api('/api/broadcast', { method: 'POST', body: JSON.stringify({ message }) });
    $('#broadcast-msg').value = '';
    toast('Ogłoszenie dodane do kolejki — bot wyśle je w ciągu kilkunastu sekund.');
    loadLive();
  } catch (err) { toast(err.message, true); }
});

$('#restart-btn').addEventListener('click', async () => {
  if (!confirm('Na pewno zrestartować bota?')) return;
  try {
    await api('/api/restart', { method: 'POST' });
    toast('Żądanie restartu wysłane — bot zrestartuje się w ciągu kilkunastu sekund.');
  } catch (err) { toast(err.message, true); }
});

setInterval(() => { if (token && !$('#panel-view').classList.contains('hidden')) refreshStatusBadge(); }, 30000);

// ===== USTAWIENIA =====
async function loadSettings() {
  try {
    const data = await api('/api/settings');
    renderPrefixes(data.groupPrefixes || {});
    renderCooldowns(data.cooldowns || {});
    renderTaxes(data.taxes || {});
  } catch (err) { toast(err.message, true); }
}

function renderPrefixes(prefixes) {
  const container = $('#prefixes-list');
  container.innerHTML = Object.entries(prefixes).map(([groupId, prefix]) => 
    `<div class="list-item"><span>${esc(groupId)}: ${esc(prefix)}</span><button onclick="removePrefix('${groupId}')" class="danger-small">✕</button></div>`
  ).join('') || '<p class="muted">Brak custom prefixów</p>';
}

function renderCooldowns(cooldowns) {
  const container = $('#cooldowns-list');
  container.innerHTML = Object.entries(cooldowns).map(([cmd, seconds]) => 
    `<div class="list-item"><span>${esc(cmd)}: ${seconds}s</span><button onclick="removeCooldown('${cmd}')" class="danger-small">✕</button></div>`
  ).join('') || '<p class="muted">Brak custom cooldownów</p>';
}

function renderTaxes(taxes) {
  const container = $('#taxes-list');
  container.innerHTML = Object.entries(taxes).map(([type, percent]) => 
    `<div class="list-item"><span>${esc(type)}: ${percent}%</span><button onclick="removeTax('${type}')" class="danger-small">✕</button></div>`
  ).join('') || '<p class="muted">Brak custom podatków</p>';
}

window.removePrefix = async function(groupId) {
  try {
    const data = await api('/api/settings');
    const prefixes = data.groupPrefixes || {};
    delete prefixes[groupId];
    await api('/api/settings', { method: 'POST', body: JSON.stringify({ groupPrefixes: prefixes }) });
    toast('Usunięto prefix.');
    loadSettings();
  } catch (err) { toast(err.message, true); }
};

window.removeCooldown = async function(cmd) {
  try {
    const data = await api('/api/settings');
    const cooldowns = data.cooldowns || {};
    delete cooldowns[cmd];
    await api('/api/settings', { method: 'POST', body: JSON.stringify({ cooldowns }) });
    toast('Usunięto cooldown.');
    loadSettings();
  } catch (err) { toast(err.message, true); }
};

window.removeTax = async function(type) {
  try {
    const data = await api('/api/settings');
    const taxes = data.taxes || {};
    delete taxes[type];
    await api('/api/settings', { method: 'POST', body: JSON.stringify({ taxes }) });
    toast('Usunięto podatek.');
    loadSettings();
  } catch (err) { toast(err.message, true); }
};

$('#add-prefix-btn').addEventListener('click', async () => {
  const groupId = $('#prefix-group').value.trim();
  const prefix = $('#prefix-value').value.trim();
  if (!groupId || !prefix) return toast('Wypełnij wszystkie pola.', true);
  try {
    const data = await api('/api/settings');
    const prefixes = data.groupPrefixes || {};
    prefixes[groupId] = prefix;
    await api('/api/settings', { method: 'POST', body: JSON.stringify({ groupPrefixes: prefixes }) });
    $('#prefix-group').value = '';
    $('#prefix-value').value = '';
    toast('Dodano prefix.');
    loadSettings();
  } catch (err) { toast(err.message, true); }
});

$('#add-cooldown-btn').addEventListener('click', async () => {
  const cmd = $('#cooldown-cmd').value.trim();
  const value = $('#cooldown-value').value;
  if (!cmd || !value) return toast('Wypełnij wszystkie pola.', true);
  try {
    const data = await api('/api/settings');
    const cooldowns = data.cooldowns || {};
    cooldowns[cmd] = parseInt(value);
    await api('/api/settings', { method: 'POST', body: JSON.stringify({ cooldowns }) });
    $('#cooldown-cmd').value = '';
    $('#cooldown-value').value = '';
    toast('Dodano cooldown.');
    loadSettings();
  } catch (err) { toast(err.message, true); }
});

$('#add-tax-btn').addEventListener('click', async () => {
  const type = $('#tax-type').value.trim();
  const value = $('#tax-value').value;
  if (!type || !value) return toast('Wypełnij wszystkie pola.', true);
  try {
    const data = await api('/api/settings');
    const taxes = data.taxes || {};
    taxes[type] = parseInt(value);
    await api('/api/settings', { method: 'POST', body: JSON.stringify({ taxes }) });
    $('#tax-type').value = '';
    $('#tax-value').value = '';
    toast('Dodano podatek.');
    loadSettings();
  } catch (err) { toast(err.message, true); }
});

$('#save-settings-btn').addEventListener('click', async () => {
  toast('Ustawienia są zapisywane automatycznie po każdej zmianie.');
});

// ===== EVENTY =====
async function loadEvents() {
  try {
    const data = await api('/api/events');
    renderEvents(data.events || []);
  } catch (err) { toast(err.message, true); }
}

function renderEvents(events) {
  const container = $('#events-list');
  const now = Date.now();
  container.innerHTML = events.map(event => {
    const isActive = now >= event.startTime && now < event.endTime;
    const timeLeft = Math.max(0, event.endTime - now);
    const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
    const minsLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
    
    const typeNames = { xp: 'XP', casino: 'Kasyno', items: 'Itemy' };
    
    return `
      <div class="event-card ${isActive ? 'active' : 'expired'}">
        <h4>${typeNames[event.type]} x${event.multiplier}</h4>
        <p class="muted">${event.description || 'Brak opisu'}</p>
        <p class="muted">Status: ${isActive ? `Aktywny (zostało ${hoursLeft}h ${minsLeft}m)` : 'Zakończony'}</p>
        <button onclick="deleteEvent('${event.id}')" class="danger-small">Usuń</button>
      </div>
    `;
  }).join('') || '<p class="muted">Brak aktywnych eventów</p>';
}

window.deleteEvent = async function(eventId) {
  if (!confirm('Usunąć ten event?')) return;
  try {
    await api(`/api/events/${eventId}`, { method: 'DELETE' });
    toast('Event usunięty.');
    loadEvents();
  } catch (err) { toast(err.message, true); }
};

$('#create-event-btn').addEventListener('click', async () => {
  const type = $('#event-type').value;
  const multiplier = $('#event-multiplier').value;
  const duration = $('#event-duration').value;
  const description = $('#event-description').value.trim();
  
  if (!multiplier || !duration) return toast('Wypełnij mnożnik i czas trwania.', true);
  
  try {
    await api('/api/events', { method: 'POST', body: JSON.stringify({ type, multiplier, durationHours: duration, description }) });
    $('#event-multiplier').value = '';
    $('#event-duration').value = '';
    $('#event-description').value = '';
    toast('Event utworzony! Powiadomienie zostanie wysłane globalnie.');
    loadEvents();
  } catch (err) { toast(err.message, true); }
});

// Dodaj obsługę nowych zakładek
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.add('hidden'));
    btn.classList.add('active');
    const tabId = `tab-${btn.dataset.tab}`;
    document.getElementById(tabId).classList.remove('hidden');
    
    // Ładuj dane dla odpowiedniej zakładki
    if (btn.dataset.tab === 'settings') loadSettings();
    if (btn.dataset.tab === 'events') loadEvents();
    if (btn.dataset.tab === 'live') loadLive();
  });
});

if (token) showPanel(); else showLogin();
