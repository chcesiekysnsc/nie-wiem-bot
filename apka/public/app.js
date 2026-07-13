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
    if (btn.dataset.tab === 'chances') loadChances();
    if (btn.dataset.tab === 'bans') loadBans();
    if (btn.dataset.tab === 'logs') { loadLogs(); loadActivity(); }
    if (btn.dataset.tab === 'gangs') loadGangs();
    if (btn.dataset.tab === 'settings') loadSettings();
    if (btn.dataset.tab === 'events') loadEvents();
    if (btn.dataset.tab === 'live') loadLive();
    if (btn.dataset.tab === 'commands') loadCommands();
    if (btn.dataset.tab === 'mody') loadMody();
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
    
    // Oblicz winrate
    const wins = data.user.wins || 0;
    const losses = data.user.losses || 0;
    const gamesPlayed = data.user.gamesPlayed || 0;
    const totalGamble = wins + losses;
    const winrate = totalGamble > 0 ? ((wins / totalGamble) * 100).toFixed(1) + '%' : '0%';

    $('#modal').innerHTML = `
      <h3>✏️ ${esc(data.name)} <span class="muted">(${esc(id)})</span></h3>
      <div style="margin-bottom:15px; background:rgba(255,255,255,0.05); padding:10px; border-radius:6px; font-size:13px; border-left: 4px solid #00e676;">
        📊 <strong>Overall Winrate:</strong> <span style="color:#00e676; font-weight:700;">${winrate}</span> 
        <span class="muted" style="margin-left:10px;">(Gry: ${gamesPlayed} | Wygrane: ${wins} | Przegrane: ${losses})</span>
      </div>
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
    
    const payload = {
      balance: $('#edit-balance').value,
      bank: $('#edit-bank').value,
      level: $('#edit-level').value,
      items
    };
    
    // Dodaj nowy przedmiot jeśli podano
    const newItemId = $('#new-item-id').value.trim();
    if (newItemId) {
      payload.addItem = {
        itemId: newItemId,
        quantity: parseInt($('#new-item-qty').value, 10) || 1
      };
    }
    
    await api(`/api/players/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    closeModal();
    toast('Zapisano zmiany gracza.');
    loadPlayers();
  } catch (err) { toast(err.message, true); }
};

window.closeModal = function () { $('#modal-overlay').classList.add('hidden'); };
$('#modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') closeModal(); });

// ===== SZANSE =====
let chanceSearchTimer = null;
$('#chance-search').addEventListener('input', () => {
  clearTimeout(chanceSearchTimer);
  chanceSearchTimer = setTimeout(loadChances, 300);
});

async function loadChances() {
  try {
    const search = encodeURIComponent($('#chance-search').value.trim());
    const data = await api(`/api/players?search=${search}&limit=200`);
    $('#chance-player-count').textContent = `Znaleziono: ${data.total}`;
    const tbody = $('#chances-table tbody');
    tbody.innerHTML = data.players.map(p => `
      <tr>
        <td>${esc(p.name)}</td>
        <td class="muted">${esc(p.id)}</td>
        <td>${esc(p.gang || '—')}</td>
        <td><button class="small" onclick="openChances('${esc(p.id)}', '${esc(p.name)}')">Szanse</button></td>
      </tr>`).join('');
  } catch (err) { toast(err.message, true); }
}

window.openChances = async function (id, name) {
  try {
    const data = await api(`/api/chances/${encodeURIComponent(id)}`);
    const rows = data.chances.map(c => {
      const isOverridden = c.current !== c.default;
      const statusClass = isOverridden ? 'style="color:#00e676; font-weight:700;"' : '';
      const statusLabel = isOverridden ? '✏️ Nadpisane' : '📌 Domyślne';
      return `
        <div class="field-group">
          <label>
            <span style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
              <span>
                <strong style="color:#fff;">${esc(c.label)}</strong>
                <span class="muted" style="margin-left:8px; font-size:12px;">${esc(c.description)}</span>
              </span>
              <span class="badge" style="background:#151722; color:#8a90a4; font-size:11px;" ${statusClass}>${statusLabel} ${isOverridden ? '(' + esc(c.current) + c.unit + ')' : ''}</span>
            </span>
            <input type="number" data-chance="${esc(c.id)}" value="${c.current}" min="${c.min}" max="${c.max}" step="${c.step}" style="margin-top:8px;">
            <span class="field-desc">Zakres: ${c.min}–${c.max}${c.unit} | Domyślnie: ${c.default}${c.unit}</span>
          </label>
        </div>`;
    }).join('');

    $('#modal').innerHTML = `
      <h3>🎲 ${esc(name)} <span class="muted">(${esc(id)})</span></h3>
      <p class="muted" style="margin-bottom:14px;">Tutaj możesz nadpisać wartości szans dla tego użytkownika. Zmiany dotyczą wyłącznie tego gracza i obowiązują natychmiast.</p>
      <div style="display:flex; flex-direction:column; gap:12px; max-height:60vh; overflow-y:auto; padding-right:4px;">
        ${rows || '<p class="muted">Brak dostępnych systemów szans.</p>'}
      </div>
      <div class="modal-actions">
        <button onclick="saveChances('${esc(id)}')">Zapisz szanse</button>
        <button class="secondary" onclick="closeModal()">Anuluj</button>
      </div>`;
    $('#modal-overlay').classList.remove('hidden');
  } catch (err) { toast(err.message, true); }
};

window.saveChances = async function (id) {
  try {
    const chances = {};
    document.querySelectorAll('#modal input[data-chance]').forEach(inp => {
      const key = inp.dataset.chance;
      const raw = inp.value.trim();
      if (raw === '' || raw === null || raw === undefined) {
        chances[key] = null;
      } else {
        const v = Number(raw);
        if (Number.isFinite(v)) {
          chances[key] = v;
        }
      }
    });
    await api(`/api/chances/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({ chances })
    });
    closeModal();
    toast('Zapisano szanse gracza.');
  } catch (err) { toast(err.message, true); }
};

// ===== USTAWIENIA =====
async function loadSettings() {
  try {
    const data = await api('/api/settings');
    
    // Załaduj cooldowny
    const cooldownsList = $('#cooldowns-list');
    cooldownsList.innerHTML = Object.entries(data.allCooldowns).map(([name, seconds]) => `
      <label>${esc(name)} <input type="number" data-cooldown="${esc(name)}" value="${seconds}" min="0" max="86400"></label>
    `).join('');
    
    // Załaduj podatki
    $('#tax-balance').value = data.taxForms.balanceTax || 4;
    $('#tax-transfer').value = data.taxForms.transferTax || 5;
    $('#tax-market').value = data.taxForms.marketTax || 10;
    $('#tax-gang').value = data.taxForms.gangTribute || 0;
    $('#tax-casino').value = data.taxForms.casinoTax || 15;
    $('#tax-mecz').value = data.taxForms.meczTax || 15;
    
    // Załaduj prefixy grup
    const prefixesList = $('#prefixes-list');
    prefixesList.innerHTML = (data.groups || []).map(group => {
      const currentPrefix = data.groupPrefixes[group.id] || '';
      const name = group.name ? group.name : `Grupa bez nazwy`;
      return `
        <label>
          <span class="prefix-group-name" style="font-weight:600; color:#fff;">${esc(name)} (Aktualny: <code style="color:#00e676; font-size:13px;">${esc(currentPrefix || '!')}</code>)</span>
          <span class="muted" style="font-size:11px; margin-bottom:4px;">ID: ${esc(group.id)}</span>
          <input type="text" data-prefix-group="${esc(group.id)}" value="${esc(currentPrefix)}" placeholder="!">
        </label>
      `;
    }).join('');
  } catch (err) { toast(err.message, true); }
}

$('#save-cooldowns').addEventListener('click', async () => {
  try {
    const cooldowns = {};
    document.querySelectorAll('#cooldowns-list input[data-cooldown]').forEach(inp => {
      cooldowns[inp.dataset.cooldown] = parseInt(inp.value) || 0;
    });
    await api('/api/settings', { 
      method: 'POST', 
      body: JSON.stringify({ allCooldowns: cooldowns }) 
    });
    toast('Zapisano cooldowny.');
  } catch (err) { toast(err.message, true); }
});

$('#save-taxes').addEventListener('click', async () => {
  try {
    await api('/api/settings', { 
      method: 'POST', 
      body: JSON.stringify({
        taxForms: {
          balanceTax: $('#tax-balance').value,
          transferTax: $('#tax-transfer').value,
          marketTax: $('#tax-market').value,
          gangTribute: $('#tax-gang').value,
          casinoTax: $('#tax-casino').value,
          meczTax: $('#tax-mecz').value
        }
      }) 
    });
    toast('Zapisano podatki.');
  } catch (err) { toast(err.message, true); }
});

$('#save-prefixes').addEventListener('click', async () => {
  try {
    const prefixes = {};
    document.querySelectorAll('#prefixes-list input[data-prefix-group]').forEach(inp => {
      const groupId = inp.dataset.prefixGroup;
      const value = inp.value.trim();
      if (value) {
        prefixes[groupId] = value;
      }
    });
    await api('/api/settings', { 
      method: 'POST', 
      body: JSON.stringify({ groupPrefixes: prefixes }) 
    });
    toast('Zapisano prefixy.');
  } catch (err) { toast(err.message, true); }
});

// ===== EVENTY =====
function getCooldownReductionPercent(event) {
  if (event.reductionPercent != null) return Math.round(Number(event.reductionPercent) || 0);
  const multiplier = Number(event.multiplier) || 1;
  return multiplier > 1 ? Math.round((1 - (1 / multiplier)) * 100) : 0;
}

function updateEventFormVisibility() {
  const type = $('#event-type').value;
  const isCooldownEvent = type === 'cooldowns';
  const isShopDiscountEvent = type === 'shop_discount';
  const isMultiplierEvent = ['xp', 'casino', 'items', 'bank_interest', 'crime_luck', 'company_payout'].includes(type);
  $('#event-multiplier-group').classList.toggle('hidden', !isMultiplierEvent);
  $('#cooldown-reduction-group').classList.toggle('hidden', !isCooldownEvent);
  $('#shop-discount-group').classList.toggle('hidden', !isShopDiscountEvent);
}

async function loadEvents() {
  try {
    const data = await api('/api/events');
    const eventsList = $('#events-list');
    if (!data.events || data.events.length === 0) {
      eventsList.innerHTML = '<p class="muted">Brak aktywnych eventów.</p>';
      return;
    }
    eventsList.innerHTML = data.events.map(event => {
      const endTime = new Date(event.endTime);
      const now = new Date();
      const remaining = endTime > now ? Math.max(0, Math.ceil((endTime - now) / 60000)) : 0;
      const typeNames = { xp: '⚡ XP', casino: '🎰 Kasyno', items: '📦 Itemy', cooldowns: '⚡ Szybsze cooldowny', shop_discount: '🛒 Przecena w sklepie', bank_interest: '🏦 Bankowy Raj', crime_luck: '🌑 Czarna Godzina', company_payout: '🪙 Midasowy Dotyk' };
      let bonusLabel = '';
      if (event.type === 'cooldowns') {
        bonusLabel = `-${getCooldownReductionPercent(event)}% cooldownów`;
      } else if (event.type === 'shop_discount') {
        const discount = event.reductionPercent != null ? Math.round(Number(event.reductionPercent)) : Math.round((1 - Number(event.multiplier || 1)) * 100);
        bonusLabel = `-${discount}% w sklepie`;
      } else {
        bonusLabel = `x${event.multiplier}`;
      }
      return `
        <div class="event-card">
          <h4>${esc(typeNames[event.type] || event.type)} ${esc(bonusLabel)}</h4>
          <p>${esc(event.description || '')}</p>
          <p class="muted">Pozostało: ${remaining} min | ID: ${esc(event.id)}</p>
          <button class="small danger" onclick="deleteEvent('${esc(event.id)}')">Usuń</button>
        </div>
      `;
    }).join('');
  } catch (err) { toast(err.message, true); }
}

$('#event-type').addEventListener('change', updateEventFormVisibility);
updateEventFormVisibility();

$('#create-event').addEventListener('click', async () => {
  try {
    const type = $('#event-type').value;
    let multiplier = parseFloat($('#event-multiplier').value);
    let cooldownReductionPercent = null;
    let discountPercent = null;
    const durationMinutes = parseInt($('#event-duration').value);
    const description = $('#event-description').value.trim();

    if (type === 'cooldowns') {
      cooldownReductionPercent = parseInt($('#event-cooldown-reduction').value, 10);
      if (!cooldownReductionPercent || cooldownReductionPercent < 1 || cooldownReductionPercent > 90) {
        return toast('Podaj skrócenie cooldownów od 1% do 90%.', true);
      }
      multiplier = 100 / (100 - cooldownReductionPercent);
    } else if (type === 'shop_discount') {
      discountPercent = parseInt($('#event-shop-discount').value, 10);
      if (!discountPercent || discountPercent < 1 || discountPercent > 90) {
        return toast('Podaj przecenę od 1% do 90%.', true);
      }
      multiplier = 1 - discountPercent / 100;
    } else {
      if (!multiplier || multiplier <= 1) {
        return toast('Podaj mnożnik większy od 1 dla tego typu eventu.', true);
      }
    }
    
    if (!type || !durationMinutes) {
      return toast('Wypełnij wszystkie wymagane pola.', true);
    }
    
    await api('/api/events', { 
      method: 'POST', 
      body: JSON.stringify({ type, multiplier, cooldownReductionPercent, discountPercent, durationMinutes, description }) 
    });
    
    $('#event-description').value = '';
    toast('Event stworzony! Bot wyśle ogłoszenie.');
    loadEvents();
  } catch (err) { toast(err.message, true); }
});

window.deleteEvent = async function (id) {
  if (!confirm('Usunąć ten event?')) return;
  try {
    await api(`/api/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
    toast('Event usunięty.');
    loadEvents();
  } catch (err) { toast(err.message, true); }
};

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
        <h3>🔫 ${esc(g.name)} <span class="muted">(${esc(g.id)})</span>${g.isAI ? ' <span class="badge warn">🤖 AI</span>' : ''}</h3>
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
        <details>
          <summary>🛒 Przedmioty Bossowego Sklepu (${g.bossShopItems.length})</summary>
          <ul>${g.bossShopItems.length ? g.bossShopItems.map(it => `<li>${it.emoji} <strong>${esc(it.name)}</strong> <span class="muted">${esc(it.description)}</span></li>`).join('') : '<li class="muted">Brak przedmiotów</li>'}</ul>
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

if (token) showPanel(); else showLogin();

// ===== KOMENDY =====
let commandsSearchTimer = null;
$('#command-search').addEventListener('input', () => {
  clearTimeout(commandsSearchTimer);
  commandsSearchTimer = setTimeout(loadCommands, 300);
});

async function loadCommands() {
  try {
    const search = encodeURIComponent($('#command-search').value.trim().toLowerCase());
    const data = await api('/api/commands');
    let commands = data.commands || [];
    
    if (search) {
      commands = commands.filter(c => 
        c.name.toLowerCase().includes(search) || 
        c.aliases.some(a => a.toLowerCase().includes(search))
      );
    }
    
    $('#command-count').textContent = `Znaleziono: ${commands.length}`;
    const tbody = $('#commands-table tbody');
    tbody.innerHTML = commands.map(c => `
      <tr>
        <td><b>!${esc(c.name)}</b></td>
        <td>${c.aliases.map(a => `!${esc(a)}`).join(', ') || '—'}</td>
        <td class="muted">Komenda</td>
        <td>
          <span class="badge ${c.disabled ? 'offline' : 'online'}">
            ${c.disabled ? 'Wyłączona' : 'Włączona'}
          </span>
        </td>
        <td>
          <button class="small ${c.disabled ? 'primary' : 'danger'}" onclick="toggleCommand('${esc(c.name)}', ${!c.disabled})">
            ${c.disabled ? 'Włącz' : 'Wyłącz'}
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) { toast(err.message, true); }
}

window.toggleCommand = async function (name, disable) {
  try {
    await api(`/api/commands/${encodeURIComponent(name)}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ disabled: disable })
    });
    toast(disable ? `Komenda !${name} została wyłączona.` : `Komenda !${name} została włączona.`);
    loadCommands();
  } catch (err) { toast(err.message, true); }
};

// ===== MODY =====
let modySearchTimer = null;
$('#mody-search').addEventListener('input', () => {
  clearTimeout(modySearchTimer);
  modySearchTimer = setTimeout(loadMody, 300);
});

async function loadMody() {
  try {
    const search = encodeURIComponent($('#mody-search').value.trim());
    const data = await api(`/api/players?search=${search}&limit=200`);
    $('#mody-count').textContent = `Znaleziono: ${data.total}`;

    const tbody = $('#mody-table tbody');
    tbody.innerHTML = data.players.map(p => `
      <tr data-mody-row="${esc(p.id)}">
        <td>${esc(p.name)}</td>
        <td class="muted">${esc(p.id)}</td>
        <td>${esc(p.gang || '—')}</td>
        <td class="muted" data-allowed-count>—</td>
        <td class="muted" data-denied-count>—</td>
        <td><button class="small" onclick="openModPermissions('${esc(p.id)}', '${esc(p.name)}')">Zarządzaj</button></td>
      </tr>`).join('');

    data.players.forEach(async p => {
      try {
        const perm = await api(`/api/permissions/${encodeURIComponent(p.id)}`);
        const allowedCount = perm.commands.filter(c => c.override === true).length;
        const deniedCount = perm.commands.filter(c => c.override === false).length;
        const row = document.querySelector(`tr[data-mody-row="${CSS.escape(p.id)}"]`);
        if (row) {
          row.querySelector('[data-allowed-count]').textContent = allowedCount;
          row.querySelector('[data-denied-count]').textContent = deniedCount;
        }
      } catch (_) {}
    });
  } catch (err) { toast(err.message, true); }
}

window.openModPermissions = async function (id, name) {
  try {
    const data = await api(`/api/permissions/${encodeURIComponent(id)}`);
    const rows = data.commands.map(c => {
      const isOverridden = c.override !== null;
      return `
        <div class="toggle-row">
          <span>
            <span class="cmd-name">!${esc(c.name)}</span>
            <span class="cmd-meta">${c.globallyDisabled ? '(globalnie wyłączona)' : ''}${isOverridden ? (c.override ? ' · ręcznie nadane' : ' · ręcznie odebrane') : ''}</span>
          </span>
          <label class="toggle-switch ${isOverridden ? 'overridden' : ''}">
            <input type="checkbox" data-perm-command="${esc(c.name)}" data-perm-user="${esc(id)}" ${c.hasAccess ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>`;
    }).join('');

    $('#modal').innerHTML = `
      <h3>🛠️ ${esc(name)} <span class="muted">(${esc(id)})</span></h3>
      <p class="muted" style="margin-bottom:14px;">Zmiana przełącznika zapisuje się natychmiast.</p>
      <div style="display:flex; flex-direction:column; gap:4px; max-height:60vh; overflow-y:auto; padding-right:4px;">
        ${rows || '<p class="muted">Brak komend do wyświetlenia.</p>'}
      </div>
      <div class="modal-actions">
        <button class="secondary" onclick="closeModal()">Zamknij</button>
      </div>`;
    $('#modal-overlay').classList.remove('hidden');

    $('#modal').querySelectorAll('input[data-perm-command]').forEach(input => {
      input.addEventListener('change', async () => {
        const command = input.dataset.permCommand;
        const userId = input.dataset.permUser;
        try {
          await api(`/api/permissions/${encodeURIComponent(userId)}`, {
            method: 'POST',
            body: JSON.stringify({ command, allowed: input.checked })
          });
          toast(`Zmieniono dostęp do !${command}.`);
          openModPermissions(userId, name);
        } catch (err) {
          toast(err.message, true);
          input.checked = !input.checked;
        }
      });
    });
  } catch (err) { toast(err.message, true); }
};
