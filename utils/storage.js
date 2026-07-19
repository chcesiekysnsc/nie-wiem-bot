require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('../config/config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  profiles: path.join(DATA_DIR, 'profiles.json'),
  inventory: path.join(DATA_DIR, 'inventory.json'),
  cooldowns: path.join(DATA_DIR, 'cooldowns.json'),
  logs: path.join(DATA_DIR, 'logs.json'),
  groupStats: path.join(DATA_DIR, 'groupStats.json'),
  activeBets: path.join(DATA_DIR, 'active_bets.json')
};

const FILE_DEFAULTS = {
  users: {},
  profiles: {},
  inventory: {},
  cooldowns: {
    commands: {},
    spam: {},
    cooldownNotifications: {},
    adminDailyUsage: {}
  },
  logs: [],
  groupStats: {},
  activeBets: {}
};

// Zmienne do obsługi PostgreSQL
const USE_POSTGRES = !!process.env.DATABASE_URL;
let pool = null;
if (USE_POSTGRES) {
  pool = require('../database/config');
}

// Lokalny cache bazy danych dla PostgreSQL (Write-Through Cache)
let cache = {
  users: {},
  profiles: {},
  inventory: {},
  cooldowns: {
    commands: {},
    spam: {},
    cooldownNotifications: {},
    adminDailyUsage: {}
  },
  logs: [],
  groupStats: {}
};
let isInitialized = false;

// Mapowanie messenger_id <-> pg_id
const messengerToPgId = new Map();
const pgIdToMessenger = new Map();

// Zapewnia unikalne identyfikatory w mapowaniu
function registerIdMapping(messengerId, pgId) {
  if (messengerId && pgId) {
    messengerToPgId.set(String(messengerId), pgId);
    pgIdToMessenger.set(pgId, String(messengerId));
  }
}

// Głębokie kopiowanie obiektu (klonowanie stanu)
function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function sanitizeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function sanitizeUser(user) {
  const base = clone(config.economy.defaultUser);
  const merged = { ...base, ...(user || {}) };

  merged.balance = sanitizeInteger(merged.balance, base.balance);
  merged.bank = Math.max(0, sanitizeInteger(merged.bank, base.bank));
  merged.level = Math.max(1, sanitizeInteger(merged.level, base.level));
  merged.xp = Math.max(0, sanitizeInteger(merged.xp, base.xp));
  merged.totalWon = Math.max(0, sanitizeInteger(merged.totalWon, base.totalWon));
  merged.totalLost = Math.max(0, sanitizeInteger(merged.totalLost, base.totalLost));
  merged.gamesPlayed = Math.max(0, sanitizeInteger(merged.gamesPlayed, base.gamesPlayed));
  merged.commandsUsed = Math.max(0, sanitizeInteger(merged.commandsUsed, base.commandsUsed || 0));
  merged.lastActiveThreadId = merged.lastActiveThreadId ? String(merged.lastActiveThreadId) : null;
  merged.prestige = Math.max(0, sanitizeInteger(merged.prestige, base.prestige));
  merged.dailyCooldown = Math.max(0, sanitizeInteger(merged.dailyCooldown, 0));
  merged.bio = typeof merged.bio === 'string' ? merged.bio.slice(0, 160) : '';
  merged.badges = Array.isArray(merged.badges)
    ? [...new Set(merged.badges.filter(badge => typeof badge === 'string'))]
    : [];
  merged.marriedTo = merged.marriedTo ? String(merged.marriedTo) : null;
  merged.negativeSince = merged.negativeSince || null;
  merged.activeLoan = merged.activeLoan || null;
  merged.blacklistedForNegativeBalance = merged.blacklistedForNegativeBalance || false;
  merged.company = merged.company && typeof merged.company === 'object' ? merged.company : null;
  merged.company2 = merged.company2 && typeof merged.company2 === 'object' ? merged.company2 : null;
  merged.commandCounts = merged.commandCounts && typeof merged.commandCounts === 'object' && !Array.isArray(merged.commandCounts)
    ? merged.commandCounts
    : {};
  merged.claimedMilestones = Array.isArray(merged.claimedMilestones)
    ? [...new Set(merged.claimedMilestones.filter(m => typeof m === 'number'))]
    : [];
  merged.name = typeof merged.name === 'string' ? merged.name.trim().slice(0, 100) : null;
  merged.defaultCity = user && typeof user.defaultCity === 'string' ? user.defaultCity.trim() : null;
  merged.openedPackagesToday = Math.max(0, sanitizeInteger(merged.openedPackagesToday, 0));
  merged.lastPackageOpenDate = merged.lastPackageOpenDate ? String(merged.lastPackageOpenDate) : null;

  return merged;
}

// Zwraca Postgres ID na podstawie Messenger ID, tworząc użytkownika w razie potrzeby
async function ensureUserPgId(client, messengerId) {
  if (!messengerId) return null;
  const mIdStr = String(messengerId);
  if (messengerToPgId.has(mIdStr)) {
    return messengerToPgId.get(mIdStr);
  }

  const res = await client.query('SELECT id FROM users WHERE messenger_id = $1', [mIdStr]);
  if (res.rows.length > 0) {
    const pgId = res.rows[0].id;
    registerIdMapping(mIdStr, pgId);
    return pgId;
  }

  // Utwórz stub w bazie
  const insertRes = await client.query(
    `INSERT INTO users (messenger_id, balance, bank, level, xp)
     VALUES ($1, 0, 0, 1, 0) RETURNING id`,
    [mIdStr]
  );
  const pgId = insertRes.rows[0].id;
  registerIdMapping(mIdStr, pgId);

  // Dodaj do lokalnego cache, aby był spójny
  cache.users[mIdStr] = sanitizeUser({ id: mIdStr });
  return pgId;
}

// ============================================================================
// INICJALIZACJA CACHE Z POSTGRESQL
// ============================================================================
async function initializeCache() {
  if (!USE_POSTGRES || isInitialized) return;
  
  console.log('[STORAGE] Inicjalizacja cache z bazy danych PostgreSQL...');
  const client = await pool.connect();
  try {
    // 1. Wczytaj użytkowników i utwórz mapowanie ID
    const usersRes = await client.query('SELECT * FROM users');
    cache.users = {};
    for (const r of usersRes.rows) {
      registerIdMapping(r.messenger_id, r.id);
      
      cache.users[r.messenger_id] = {
        id: r.messenger_id,
        name: r.name,
        balance: Number(r.balance) || 0,
        bank: Number(r.bank) || 0,
        level: r.level || 1,
        xp: Number(r.xp) || 0,
        prestige: r.prestige || 0,
        badges: r.badges || [],
        marriedTo: null, // Uzupełnimy w drugim kroku po wczytaniu mapowania
        dailyCooldown: r.daily_cooldown ? new Date(r.daily_cooldown).getTime() : 0,
        messageCount: Number(r.message_count) || 0,
        groupMessages: typeof r.group_messages === 'object' ? r.group_messages : {},
        commandCounts: typeof r.command_counts === 'object' ? r.command_counts : {},
        company: null, // Uzupełnimy niżej
        company2: null, // Uzupełnimy niżej
        defaultCity: r.default_city,
        openedPackagesToday: r.opened_packages_today || 0,
        lastPackageOpenDate: r.last_package_open_date ? new Date(r.last_package_open_date).toISOString().split('T')[0] : null,
        negativeSince: r.negative_since ? new Date(r.negative_since).getTime() : null,
        activeLoan: typeof r.active_loan === 'object' ? r.active_loan : null,
        blacklistedForNegativeBalance: Boolean(r.blacklisted_for_negative_balance),
        claimedMilestones: Array.isArray(r.claimed_milestones) ? r.claimed_milestones : [],
        bio: r.bio || '',
        lastWorkTime: r.last_work_time ? new Date(r.last_work_time).getTime() : 0,
        // Zachowujemy te pola z defaultUser dla kompatybilności wstecznej
        gamesPlayed: 0,
        totalWon: 0,
        totalLost: 0,
        wins: 0,
        losses: 0,
        commandsUsed: 0
      };
    }

    // Uzupełnij marriedTo dla użytkowników
    for (const r of usersRes.rows) {
      if (r.married_to) {
        const spouseMessengerId = pgIdToMessenger.get(r.married_to);
        if (spouseMessengerId) {
          cache.users[r.messenger_id].marriedTo = spouseMessengerId;
        }
      }
    }

    // 2. Wczytaj ekwipunek
    const invRes = await client.query('SELECT i.*, u.messenger_id FROM inventory i JOIN users u ON u.id = i.user_id');
    cache.inventory = {};
    for (const r of invRes.rows) {
      if (!cache.inventory[r.messenger_id]) cache.inventory[r.messenger_id] = {};
      cache.inventory[r.messenger_id][r.item_id] = r.amount;
    }

    // 3. Wczytaj firmy i przypisz je do użytkowników
    const compRes = await client.query('SELECT c.*, u.messenger_id FROM companies c JOIN users u ON u.id = c.owner_id');
    for (const r of compRes.rows) {
      const u = cache.users[r.messenger_id];
      if (u) {
        const companyObj = {
          id: r.id,
          name: r.name,
          type: r.type,
          level: r.level || 1,
          income: r.income || {},
          lastClaim: r.last_claim ? new Date(r.last_claim).getTime() : null
        };
        // Sprawdź czy to slot 1 czy 2
        const isSlot2 = (usersRes.rows.find(ur => ur.id === r.owner_id)?.company2_id) === r.id;
        if (isSlot2) {
          u.company2 = companyObj;
        } else {
          u.company = companyObj;
        }
      }
    }

    // 4. Wczytaj cooldowny i powiadomienia
    cache.cooldowns = { commands: {}, spam: {}, cooldownNotifications: {}, adminDailyUsage: {} };
    
    const cmdCdRes = await client.query('SELECT cc.*, u.messenger_id FROM command_cooldowns cc JOIN users u ON u.id = cc.user_id');
    for (const r of cmdCdRes.rows) {
      if (!cache.cooldowns.commands[r.messenger_id]) cache.cooldowns.commands[r.messenger_id] = {};
      cache.cooldowns.commands[r.messenger_id][r.command_name] = new Date(r.expires_at).getTime();
    }

    const spamRes = await client.query('SELECT se.*, u.messenger_id FROM spam_entries se JOIN users u ON u.id = se.user_id');
    for (const r of spamRes.rows) {
      const timestamps = Array.isArray(r.timestamps) ? r.timestamps.map(t => new Date(t).getTime()) : [];
      cache.cooldowns.spam[r.messenger_id] = {
        timestamps,
        blockedUntil: r.blocked_until ? new Date(r.blocked_until).getTime() : 0,
        warningCount: r.warning_count || 0,
        blacklisted: Boolean(r.blacklisted)
      };
    }

    // 5. Wczytaj statystyki grup
    const groupStatsRes = await client.query('SELECT gs.*, g.prefix FROM group_stats gs LEFT JOIN groups g ON g.thread_id = gs.thread_id');
    cache.groupStats = {};
    for (const r of groupStatsRes.rows) {
      cache.groupStats[r.thread_id] = {
        prefix: r.prefix || '!',
        threadName: r.thread_name,
        visibleMessages: Number(r.visible_messages) || 0,
        processedMessages: Number(r.processed_messages) || 0,
        commandsExecuted: Number(r.commands_executed) || 0,
        mentionsCount: Number(r.mentions_count) || 0,
        firstUse: r.first_use ? new Date(r.first_use).getTime() : null,
        lastUpdated: r.last_updated ? new Date(r.last_updated).getTime() : null,
        seenMessageIds: Array.isArray(r.seen_message_ids) ? r.seen_message_ids : []
      };
    }

    // 6. Wczytaj profil systemowy (profiles.json)
    cache.profiles = {
      blacklist: [],
      trueBlacklist: [],
      blacklistedGroups: [],
      threadSettings: {},
      gangs: {},
      playerLoans: [],
      lastResetWinners: [],
      allowedAI: [],
      disabledCommands: [],
      proposalModeration: {},
      afk: {},
      chanceOverrides: {},
      eventCasinoMultiBetUsage: {},
      lastfmConnections: {}
    };

    // Czarna lista użytkowników
    const blRes = await client.query('SELECT user_id FROM blacklist');
    cache.profiles.blacklist = blRes.rows.map(r => r.user_id);

    // Zablokowane grupy
    const blgRes = await client.query('SELECT thread_id FROM blacklisted_groups');
    cache.profiles.blacklistedGroups = blgRes.rows.map(r => r.thread_id);

    // Ustawienia wątków
    const tsRes = await client.query('SELECT * FROM thread_settings');
    for (const r of tsRes.rows) {
      cache.profiles.threadSettings[r.thread_id] = {
        prefix: r.prefix || '!',
        loopUsers: r.loop_users || [],
        nicknameGuards: r.nickname_guards || {},
        unsendLoggingEnabled: Boolean(r.unsend_logging_enabled)
      };
    }

    // Oczekujące moderacje propozycji
    const pmRes = await client.query('SELECT pm.*, u.messenger_id FROM proposal_moderation pm JOIN users u ON u.id = pm.user_id');
    for (const r of pmRes.rows) {
      cache.profiles.proposalModeration[r.messenger_id] = {
        warnings: r.warnings || 0,
        banned: Boolean(r.banned)
      };
    }

    // AFK użytkownicy
    const afkRes = await client.query('SELECT au.*, u.messenger_id FROM afk_users au JOIN users u ON u.id = au.user_id');
    for (const r of afkRes.rows) {
      cache.profiles.afk[r.messenger_id] = {
        reason: r.reason || '',
        enabled: Boolean(r.enabled),
        time: r.time ? new Date(r.time).getTime() : Date.now()
      };
    }

    // Nadpisania szans (Chance Overrides)
    const coRes = await client.query('SELECT co.*, u.messenger_id FROM chance_overrides co JOIN users u ON u.id = co.user_id');
    for (const r of coRes.rows) {
      cache.profiles.chanceOverrides[r.messenger_id] = {
        crime_success: r.crime_success,
        rob_success: r.rob_success,
        work_luck: r.work_luck,
        box_drop_luck: r.box_drop_luck,
        company_breakdown: r.company_breakdown,
        gang_heist_success: r.gang_heist_success,
        lottery_ticket_mult: r.lottery_ticket_mult,
        gielda_luck: r.gielda_luck,
        coinflip_win: r.coinflip_win,
        roulette_win_luck: r.roulette_win_luck,
        slots_win_luck: r.slots_win_luck,
        rr_solo_survive: r.rr_solo_survive,
        rr_duel_bullet: r.rr_duel_bullet,
        blackjack_save_luck: r.blackjack_save_luck,
        bet_win_luck: r.bet_win_luck
      };
    }

    // Pożyczki graczy
    const loansRes = await client.query(`
      SELECT pl.*, u1.messenger_id as borrower, u2.messenger_id as lender
      FROM player_loans pl
      JOIN users u1 ON u1.id = pl.borrower_id
      JOIN users u2 ON u2.id = pl.lender_id
    `);
    cache.profiles.playerLoans = loansRes.rows.map(r => ({
      id: r.id,
      borrowerId: r.borrower,
      lenderId: r.lender,
      amount: Number(r.amount) || 0,
      interestRate: Number(r.interest_rate) || 0,
      dueDate: r.due_date ? new Date(r.due_date).getTime() : null,
      status: r.status || 'active'
    }));

    // Zwycięzcy miesięczni
    const winRes = await client.query('SELECT mw.*, u.messenger_id FROM monthly_winners mw JOIN users u ON u.id = mw.user_id');
    cache.profiles.lastResetWinners = winRes.rows.map(r => ({
      userId: r.messenger_id,
      total: Number(r.total) || 0,
      item: r.item
    }));

    // Multi-bet usage kasyna
    const mcRes = await client.query('SELECT ec.*, u.messenger_id FROM event_casino_multi_bet_usage ec JOIN users u ON u.id = ec.user_id');
    for (const r of mcRes.rows) {
      cache.profiles.eventCasinoMultiBetUsage[r.messenger_id] = Number(r.usage_count) || 0;
    }

    // Połączenia Last.fm
    const lfmRes = await client.query('SELECT lc.*, u.messenger_id FROM lastfm_connections lc JOIN users u ON u.id = lc.user_id');
    for (const r of lfmRes.rows) {
      cache.profiles.lastfmConnections[r.messenger_id] = {
        username: r.username,
        incognito: Boolean(r.incognito)
      };
    }

    // GANGI i ich członkowie, depozyty, sojusze
    const gangsRes = await client.query('SELECT * FROM gangs');
    const membersRes = await client.query('SELECT gm.*, u.messenger_id FROM gang_members gm JOIN users u ON u.id = gm.user_id');
    const depositsRes = await client.query('SELECT gd.*, u.messenger_id FROM gang_deposits gd JOIN users u ON u.id = gd.user_id');
    const alliancesRes = await client.query(`
      SELECT ga.*, g1.name as gang_name, g2.name as ally_name
      FROM gang_alliances ga
      JOIN gangs g1 ON g1.id = ga.gang_id
      JOIN gangs g2 ON g2.id = ga.ally_gang_id
    `);

    cache.profiles.gangs = {};
    for (const g of gangsRes.rows) {
      const bossMessengerId = pgIdToMessenger.get(g.boss_id) || null;
      
      cache.profiles.gangs[g.name] = {
        name: g.name,
        bossId: bossMessengerId,
        vault: Number(g.vault) || 0,
        levelDziupla: g.level_dziupla || 0,
        levelBiznesy: g.level_biznesy || 0,
        levelFach: g.level_fach || 0,
        reputation: g.reputation || 0,
        tributePercent: g.tribute_percent || 0,
        lastHeistTime: g.last_heist_time ? new Date(g.lastHeistTime).getTime() : null,
        lastAttackTime: g.last_attack_time ? new Date(g.lastAttackTime).getTime() : null,
        lastTerritoryCaptureAt: g.last_territory_capture_at ? new Date(g.last_territory_capture_at).getTime() : null,
        shieldUntil: g.shield_until ? new Date(g.shield_until).getTime() : null,
        lastSupportTime: g.last_support_time ? new Date(g.last_support_time).getTime() : null,
        members: [],
        deputies: [],
        deposits: {},
        alliances: []
      };
    }

    // Przypisz członków do gangów
    for (const m of membersRes.rows) {
      const gang = gangsRes.rows.find(gr => gr.id === m.gang_id);
      if (gang && cache.profiles.gangs[gang.name]) {
        const gObj = cache.profiles.gangs[gang.name];
        gObj.members.push(m.messenger_id);
        if (m.role === 'deputy') {
          gObj.deputies.push(m.messenger_id);
        }
      }
    }

    // Przypisz depozyty
    for (const d of depositsRes.rows) {
      const gang = gangsRes.rows.find(gr => gr.id === d.gang_id);
      if (gang && cache.profiles.gangs[gang.name]) {
        cache.profiles.gangs[gang.name].deposits[d.messenger_id] = Number(d.amount) || 0;
      }
    }

    // Przypisz sojusze
    for (const a of alliancesRes.rows) {
      if (cache.profiles.gangs[a.gang_name]) {
        cache.profiles.gangs[a.gang_name].alliances.push(a.ally_name);
      }
    }

    // 7. Wczytaj game_config (konfiguracje ogólne, dynamiczni admini, itp.)
    const gcRes = await client.query('SELECT * FROM game_config');
    for (const r of gcRes.rows) {
      if (r.value_type === 'json') {
        const parsed = JSON.parse(r.value);
        if (r.key === 'active_events') {
          cache.profiles.activeEvents = parsed;
        } else if (r.key === 'true_blacklist') {
          cache.profiles.trueBlacklist = parsed;
        } else if (r.key === 'admin_daily_usage') {
          cache.cooldowns.adminDailyUsage = parsed;
        } else if (r.key.startsWith('broadcast_')) {
          cache.profiles.startupBroadcastDone = cache.profiles.startupBroadcastDone || {};
          const subKey = r.key.replace('broadcast_', '');
          cache.profiles.startupBroadcastDone[subKey] = parsed.done;
        } else if (r.key.startsWith('ai_allowed_')) {
          cache.profiles.allowedAI.push(parsed);
        } else if (r.key.startsWith('disabled_command_')) {
          cache.profiles.disabledCommands.push(parsed.command);
        }
      }
    }

    // 8. Wczytaj logi
    const logsRes = await client.query('SELECT * FROM logs ORDER BY created_at DESC LIMIT 500');
    cache.logs = logsRes.rows.map(r => ({
      id: String(r.id),
      timestamp: new Date(r.created_at).toISOString(),
      action: r.action,
      userId: pgIdToMessenger.get(r.user_id) || null,
      threadId: r.thread_id,
      details: r.details || {}
    }));

    isInitialized = true;
    console.log('[STORAGE] Cache PostgreSQL załadowany pomyślnie.');
  } catch (err) {
    console.error('[STORAGE] Błąd podczas inicjalizacji cache PostgreSQL:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Zapewnienie, że dane plikowe są gotowe (dla fallbacku)
function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const BACKUP_DIR = 'C:\\Users\\dupek\\.gemini\\antigravity\\db_backups';
  let hasBackupDir = false;
  if (process.platform === 'win32') {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
      hasBackupDir = true;
    } catch (_) {}
  }

  for (const [key, filePath] of Object.entries(DATA_FILES)) {
    const backupPath = hasBackupDir ? path.join(BACKUP_DIR, `${key}.json`) : null;
    const localExists = fs.existsSync(filePath);
    const localEmpty = localExists ? !fs.readFileSync(filePath, 'utf8').trim() : true;

    if (localEmpty) {
      if (backupPath && fs.existsSync(backupPath) && fs.readFileSync(backupPath, 'utf8').trim()) {
        fs.writeFileSync(filePath, fs.readFileSync(backupPath, 'utf8'), 'utf8');
      } else {
        fs.writeFileSync(filePath, JSON.stringify(FILE_DEFAULTS[key], null, 2));
      }
    }

    if (backupPath && fs.existsSync(filePath)) {
      const localContent = fs.readFileSync(filePath, 'utf8');
      if (localContent.trim()) {
        fs.writeFileSync(backupPath, localContent, 'utf8');
      }
    }
  }
}

function normalizeCooldowns(data) {
  const normalized = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  normalized.commands = normalized.commands && typeof normalized.commands === 'object' && !Array.isArray(normalized.commands) ? normalized.commands : {};
  normalized.spam = normalized.spam && typeof normalized.spam === 'object' && !Array.isArray(normalized.spam) ? normalized.spam : {};
  normalized.cooldownNotifications = normalized.cooldownNotifications && typeof normalized.cooldownNotifications === 'object' && !Array.isArray(normalized.cooldownNotifications) ? normalized.cooldownNotifications : {};
  normalized.adminDailyUsage = normalized.adminDailyUsage && typeof normalized.adminDailyUsage === 'object' && !Array.isArray(normalized.adminDailyUsage) ? normalized.adminDailyUsage : {};
  return normalized;
}

function normalizeData(key, data) {
  if (key === 'logs') return Array.isArray(data) ? data : [];
  if (key === 'cooldowns') return normalizeCooldowns(data);
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function loadDataLocal(key) {
  ensureDataFiles();
  const filePath = DATA_FILES[key];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = raw.trim() ? JSON.parse(raw) : clone(FILE_DEFAULTS[key]);
    return normalizeData(key, parsed);
  } catch (error) {
    const fallback = clone(FILE_DEFAULTS[key]);
    saveDataLocal(key, fallback);
    return fallback;
  }
}

function saveDataLocal(key, data) {
  ensureDataFiles();
  const filePath = DATA_FILES[key];
  const normalized = normalizeData(key, data);
  const content = JSON.stringify(normalized, null, 2);
  fs.writeFileSync(filePath, content);

  const BACKUP_DIR = 'C:\\Users\\dupek\\.gemini\\antigravity\\db_backups';
  if (process.platform === 'win32') {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
      const backupPath = path.join(BACKUP_DIR, `${key}.json`);
      fs.writeFileSync(backupPath, content, 'utf8');
    } catch (_) {}
  }
  return normalized;
}

function loadData(key) {
  if (USE_POSTGRES) {
    if (!isInitialized) {
      throw new Error('[STORAGE] Wywołano loadData przed zainicjalizowaniem cache! Użyj withData.');
    }
    return cache[key];
  }
  return loadDataLocal(key);
}

function saveData(key, data) {
  if (USE_POSTGRES) {
    cache[key] = normalizeData(key, data);
    // synchroniczny zapis od razu do bazy
    saveCacheToDatabase().catch(err => console.error('[STORAGE] Błąd asynchronicznego zapisu w saveData:', err));
    return cache[key];
  }
  return saveDataLocal(key, data);
}

function getUser(userId, usersData = null) {
  const users = usersData || loadData('users');
  const uIdStr = String(userId);
  if (!Object.prototype.hasOwnProperty.call(users, uIdStr)) {
    return null;
  }
  users[uIdStr] = sanitizeUser(users[uIdStr]);
  users[uIdStr].id = uIdStr;
  return users[uIdStr];
}

function createUser(userId, usersData = null) {
  const users = usersData || loadData('users');
  const uIdStr = String(userId);
  users[uIdStr] = sanitizeUser(users[uIdStr]);
  users[uIdStr].id = uIdStr;

  if (!usersData) {
    saveData('users', users);
  }
  return users[uIdStr];
}

function updateUser(userId, updater, usersData = null) {
  const users = usersData || loadData('users');
  const uIdStr = String(userId);
  const current = createUser(uIdStr, users);

  let nextUser;
  if (typeof updater === 'function') {
    nextUser = updater(clone(current)) || current;
  } else {
    nextUser = { ...current, ...(updater || {}) };
  }

  users[uIdStr] = sanitizeUser(nextUser);
  users[uIdStr].id = uIdStr;

  if (!usersData) {
    saveData('users', users);
  }
  return users[uIdStr];
}

function appendLog(logsData, entry) {
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry
  };

  logsData.unshift(record);
  if (logsData.length > 5000) {
    logsData.length = 5000;
  }
  return record;
}

// Zapis cache do PostgreSQL na podstawie wykrytego diffu
async function saveCacheToDatabase() {
  if (!USE_POSTGRES) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Zapisz/aktualizuj użytkowników i ich powiązania
    for (const [messengerId, u] of Object.entries(cache.users)) {
      const spousePgId = u.marriedTo ? await ensureUserPgId(client, u.marriedTo) : null;
      
      // Zapisujemy najpierw podstawowe dane w users, pomijając relację firmy, bo firmy wstawiamy potem
      const res = await client.query(
        `INSERT INTO users (
          messenger_id, name, balance, bank, level, xp, prestige,
          badges, married_to, daily_cooldown, message_count,
          group_messages, command_counts, default_city,
          opened_packages_today, last_package_open_date, negative_since,
          active_loan, blacklisted_for_negative_balance,
          claimed_milestones, bio, last_work_time
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14,
          $15, $16, $17,
          $18, $19,
          $20, $21, $22
        )
        ON CONFLICT (messenger_id) DO UPDATE SET
          name = EXCLUDED.name,
          balance = EXCLUDED.balance,
          bank = EXCLUDED.bank,
          level = EXCLUDED.level,
          xp = EXCLUDED.xp,
          prestige = EXCLUDED.prestige,
          badges = EXCLUDED.badges,
          married_to = EXCLUDED.married_to,
          daily_cooldown = EXCLUDED.daily_cooldown,
          message_count = EXCLUDED.message_count,
          group_messages = EXCLUDED.group_messages,
          command_counts = EXCLUDED.command_counts,
          default_city = EXCLUDED.default_city,
          opened_packages_today = EXCLUDED.opened_packages_today,
          last_package_open_date = EXCLUDED.last_package_open_date,
          negative_since = EXCLUDED.negative_since,
          active_loan = EXCLUDED.active_loan,
          blacklisted_for_negative_balance = EXCLUDED.blacklisted_for_negative_balance,
          claimed_milestones = EXCLUDED.claimed_milestones,
          bio = EXCLUDED.bio,
          last_work_time = EXCLUDED.last_work_time
        RETURNING id`,
        [
          String(messengerId),
          u.name || null,
          Number(u.balance) || 0,
          Number(u.bank) || 0,
          Number(u.level) || 1,
          Number(u.xp) || 0,
          Number(u.prestige) || 0,
          u.badges || [],
          spousePgId,
          u.dailyCooldown ? new Date(u.dailyCooldown) : null,
          Number(u.messageCount) || 0,
          JSON.stringify(u.groupMessages || {}),
          JSON.stringify(u.commandCounts || {}),
          u.defaultCity || null,
          u.openedPackagesToday || 0,
          u.lastPackageOpenDate || null,
          u.negativeSince ? new Date(u.negativeSince) : null,
          u.activeLoan ? JSON.stringify(u.activeLoan) : null,
          Boolean(u.blacklistedForNegativeBalance),
          JSON.stringify(u.claimedMilestones || []),
          String(u.bio || ''),
          u.lastWorkTime ? new Date(u.lastWorkTime) : null
        ]
      );
      
      const pgId = res.rows[0].id;
      registerIdMapping(messengerId, pgId);

      // Zapisz/aktualizuj firmy
      const companySlots = [
        { key: 'company', field: 'company_id' },
        { key: 'company2', field: 'company2_id' }
      ];

      for (const slot of companySlots) {
        const comp = u[slot.key];
        if (comp && typeof comp === 'object') {
          const compRes = await client.query(
            `INSERT INTO companies (owner_id, name, type, level, income, last_claim)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              pgId,
              String(comp.name),
              String(comp.type),
              Number(comp.level) || 1,
              JSON.stringify(comp.income || {}),
              comp.lastClaim ? new Date(comp.lastClaim) : null
            ]
          );
          const newCompanyId = compRes.rows[0].id;
          comp.id = newCompanyId;
          
          await client.query(`UPDATE users SET ${slot.field} = $1 WHERE id = $2`, [newCompanyId, pgId]);
        } else {
          // Pobierz obecną firmę w bazie i skasuj ją jeśli u.company jest null
          const dbUserRes = await client.query(`SELECT ${slot.field} FROM users WHERE id = $1`, [pgId]);
          const dbCompanyId = dbUserRes.rows[0]?.[slot.field];
          if (dbCompanyId) {
            await client.query(`UPDATE users SET ${slot.field} = NULL WHERE id = $1`, [pgId]);
            await client.query(`DELETE FROM companies WHERE id = $1`, [dbCompanyId]);
          }
        }
      }
    }

    // Zapisz/aktualizuj ekwipunki
    for (const [messengerId, items] of Object.entries(cache.inventory)) {
      const pgUserId = await ensureUserPgId(client, messengerId);
      if (!pgUserId) continue;

      // Wyczyszczenie i wstawienie na nowo (najprostsze i najbezpieczniejsze)
      await client.query('DELETE FROM inventory WHERE user_id = $1', [pgUserId]);
      
      for (const [itemId, amount] of Object.entries(items)) {
        if (Number(amount) <= 0) continue;
        await client.query(
          `INSERT INTO inventory (user_id, item_id, amount)
           VALUES ($1, $2, $3)`,
          [pgUserId, String(itemId), Math.floor(Number(amount))]
        );
      }
    }

    // Zapisz/aktualizuj cooldowny
    for (const [messengerId, userCooldowns] of Object.entries(cache.cooldowns.commands)) {
      const pgUserId = await ensureUserPgId(client, messengerId);
      if (!pgUserId) continue;

      await client.query('DELETE FROM command_cooldowns WHERE user_id = $1', [pgUserId]);
      for (const [cmd, exp] of Object.entries(userCooldowns)) {
        if (Number(exp) <= Date.now()) continue; // Nie zapisujemy przeterminowanych
        await client.query(
          `INSERT INTO command_cooldowns (user_id, command_name, expires_at)
           VALUES ($1, $2, $3)`,
          [pgUserId, String(cmd), new Date(Number(exp))]
        );
      }
    }

    // Zapisz/aktualizuj spam entries
    for (const [messengerId, entry] of Object.entries(cache.cooldowns.spam)) {
      const pgUserId = await ensureUserPgId(client, messengerId);
      if (!pgUserId) continue;

      const timestamps = Array.isArray(entry.timestamps)
        ? entry.timestamps.map(t => new Date(Number(t)))
        : [];
      const blockedUntil = Number(entry.blockedUntil) > 0 ? new Date(Number(entry.blockedUntil)) : null;

      await client.query(
        `INSERT INTO spam_entries (user_id, timestamps, blocked_until, warning_count, blacklisted, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           timestamps = EXCLUDED.timestamps,
           blocked_until = EXCLUDED.blocked_until,
           warning_count = EXCLUDED.warning_count,
           blacklisted = EXCLUDED.blacklisted`,
        [pgUserId, timestamps, blockedUntil, entry.warningCount || 0, Boolean(entry.blacklisted)]
      );
    }

    // Zapisz/aktualizuj statystyki grup i ustawienia
    for (const [threadId, stats] of Object.entries(cache.groupStats)) {
      await client.query(
        `INSERT INTO groups (thread_id, prefix, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (thread_id) DO UPDATE SET
           prefix = EXCLUDED.prefix,
           name = EXCLUDED.name`,
        [String(threadId), stats.prefix || '!', stats.threadName || null]
      );

      await client.query(
        `INSERT INTO group_stats (
          thread_id, thread_name, visible_messages, processed_messages,
          commands_executed, mentions_count, first_use, last_updated, seen_message_ids
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9
        )
        ON CONFLICT (thread_id) DO UPDATE SET
          thread_name = EXCLUDED.thread_name,
          visible_messages = EXCLUDED.visible_messages,
          processed_messages = EXCLUDED.processed_messages,
          commands_executed = EXCLUDED.commands_executed,
          mentions_count = EXCLUDED.mentions_count,
          last_updated = EXCLUDED.last_updated,
          seen_message_ids = EXCLUDED.seen_message_ids`,
        [
          String(threadId),
          stats.threadName || null,
          Number(stats.visibleMessages) || 0,
          Number(stats.processedMessages) || 0,
          Number(stats.commandsExecuted) || 0,
          Number(stats.mentionsCount) || 0,
          stats.firstUse ? new Date(stats.firstUse) : null,
          stats.lastUpdated ? new Date(stats.lastUpdated) : null,
          JSON.stringify(stats.seenMessageIds || [])
        ]
      );
    }

    // Zapisz/aktualizuj gangi
    const resolvedGangs = [];
    for (const [gangName, g] of Object.entries(cache.profiles.gangs || {})) {
      const bossPgId = g.bossId ? await ensureUserPgId(client, g.bossId) : null;
      
      const gangRes = await client.query(
        `INSERT INTO gangs (
          name, boss_id, vault, level_dziupla, level_biznesy, level_fach,
          reputation, tribute_percent, last_heist_time, last_attack_time,
          last_territory_capture_at, shield_until, last_support_time
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13
        )
        ON CONFLICT (name) DO UPDATE SET
          boss_id = EXCLUDED.boss_id,
          vault = EXCLUDED.vault,
          level_dziupla = EXCLUDED.level_dziupla,
          level_biznesy = EXCLUDED.level_biznesy,
          level_fach = EXCLUDED.level_fach,
          reputation = EXCLUDED.reputation,
          tribute_percent = EXCLUDED.tribute_percent,
          last_heist_time = EXCLUDED.last_heist_time,
          last_attack_time = EXCLUDED.last_attack_time,
          last_territory_capture_at = EXCLUDED.last_territory_capture_at,
          shield_until = EXCLUDED.shield_until,
          last_support_time = EXCLUDED.last_support_time
        RETURNING id`,
        [
          String(gangName),
          bossPgId,
          Number(g.vault) || 0,
          g.levelDziupla || 0,
          g.levelBiznesy || 0,
          g.levelFach || 0,
          g.reputation || 0,
          g.tributePercent || 0,
          g.lastHeistTime ? new Date(g.lastHeistTime) : null,
          g.lastAttackTime ? new Date(g.lastAttackTime) : null,
          g.lastTerritoryCaptureAt ? new Date(g.lastTerritoryCaptureAt) : null,
          g.shieldUntil ? new Date(g.shieldUntil) : null,
          g.lastSupportTime ? new Date(g.lastSupportTime) : null
        ]
      );
      
      const newGangId = gangRes.rows[0].id;
      resolvedGangs.push(newGangId);

      // Członkowie gangu
      await client.query('DELETE FROM gang_members WHERE gang_id = $1', [newGangId]);
      for (const memberId of g.members || []) {
        const mPgId = await ensureUserPgId(client, memberId);
        if (!mPgId) continue;
        const role = (g.deputies || []).includes(memberId) ? 'deputy' : 'member';
        await client.query(
          `INSERT INTO gang_members (gang_id, user_id, role)
           VALUES ($1, $2, $3)`,
          [newGangId, mPgId, role]
        );
      }

      // Depozyty gangu
      await client.query('DELETE FROM gang_deposits WHERE gang_id = $1', [newGangId]);
      for (const [mId, amt] of Object.entries(g.deposits || {})) {
        const mPgId = await ensureUserPgId(client, mId);
        if (!mPgId) continue;
        await client.query(
          `INSERT INTO gang_deposits (gang_id, user_id, amount)
           VALUES ($1, $2, $3)`,
          [newGangId, mPgId, Math.max(0, Number(amt) || 0)]
        );
      }
    }

    // Skasuj gangi, których nie ma już w cache
    if (resolvedGangs.length > 0) {
      await client.query('DELETE FROM gangs WHERE id NOT IN (' + resolvedGangs.join(',') + ')');
    }

    // Czarna lista i zablokowane grupy
    await client.query('DELETE FROM blacklist');
    for (const uid of cache.profiles.blacklist || []) {
      await client.query('INSERT INTO blacklist (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [String(uid)]);
    }

    await client.query('DELETE FROM blacklisted_groups');
    for (const tid of cache.profiles.blacklistedGroups || []) {
      await client.query('INSERT INTO blacklisted_groups (thread_id) VALUES ($1) ON CONFLICT DO NOTHING', [String(tid)]);
    }

    // Ustawienia wątków
    for (const [tid, s] of Object.entries(cache.profiles.threadSettings || {})) {
      await client.query(
        `INSERT INTO thread_settings (thread_id, prefix, loop_users, nickname_guards, unsend_logging_enabled)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (thread_id) DO UPDATE SET
           prefix = EXCLUDED.prefix,
           loop_users = EXCLUDED.loop_users,
           nickname_guards = EXCLUDED.nickname_guards,
           unsend_logging_enabled = EXCLUDED.unsend_logging_enabled`,
        [
          String(tid),
          s.prefix || '!',
          JSON.stringify(s.loopUsers || []),
          JSON.stringify(s.nicknameGuards || {}),
          Boolean(s.unsendLoggingEnabled)
        ]
      );
    }

    // Moderacja propozycji
    for (const [mId, pm] of Object.entries(cache.profiles.proposalModeration || {})) {
      const pgUserId = await ensureUserPgId(client, mId);
      if (!pgUserId) continue;
      await client.query(
        `INSERT INTO proposal_moderation (user_id, warnings, banned, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           warnings = EXCLUDED.warnings,
           banned = EXCLUDED.banned`,
        [pgUserId, pm.warnings || 0, Boolean(pm.banned)]
      );
    }

    // AFK użytkownicy
    for (const [mId, data] of Object.entries(cache.profiles.afk || {})) {
      const pgUserId = await ensureUserPgId(client, mId);
      if (!pgUserId) continue;
      await client.query(
        `INSERT INTO afk_users (user_id, reason, enabled, time)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET
           reason = EXCLUDED.reason,
           enabled = EXCLUDED.enabled,
           time = EXCLUDED.time`,
        [pgUserId, data.reason || '', Boolean(data.enabled), new Date(data.time)]
      );
    }

    // Nadpisania szans
    for (const [mId, ov] of Object.entries(cache.profiles.chanceOverrides || {})) {
      const pgUserId = await ensureUserPgId(client, mId);
      if (!pgUserId) continue;
      await client.query(
        `INSERT INTO chance_overrides (
          user_id, crime_success, rob_success, work_luck, box_drop_luck,
          company_breakdown, gang_heist_success, lottery_ticket_mult,
          gielda_luck, coinflip_win, roulette_win_luck, slots_win_luck,
          rr_solo_survive, rr_duel_bullet, blackjack_save_luck, bet_win_luck
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )
        ON CONFLICT (user_id) DO UPDATE SET
          crime_success = EXCLUDED.crime_success,
          rob_success = EXCLUDED.rob_success,
          work_luck = EXCLUDED.work_luck,
          box_drop_luck = EXCLUDED.box_drop_luck,
          company_breakdown = EXCLUDED.company_breakdown,
          gang_heist_success = EXCLUDED.gang_heist_success,
          lottery_ticket_mult = EXCLUDED.lottery_ticket_mult,
          gielda_luck = EXCLUDED.gielda_luck,
          coinflip_win = EXCLUDED.coinflip_win,
          roulette_win_luck = EXCLUDED.roulette_win_luck,
          slots_win_luck = EXCLUDED.slots_win_luck,
          rr_solo_survive = EXCLUDED.rr_solo_survive,
          rr_duel_bullet = EXCLUDED.rr_duel_bullet,
          blackjack_save_luck = EXCLUDED.blackjack_save_luck,
          bet_win_luck = EXCLUDED.bet_win_luck`,
        [
          pgUserId,
          ov.crime_success, ov.rob_success, ov.work_luck, ov.box_drop_luck,
          ov.company_breakdown, ov.gang_heist_success, ov.lottery_ticket_mult,
          ov.gielda_luck, ov.coinflip_win, ov.roulette_win_luck, ov.slots_win_luck,
          ov.rr_solo_survive, ov.rr_duel_bullet, ov.blackjack_save_luck, ov.bet_win_luck
        ]
      );
    }

    // Pożyczki graczy
    await client.query('DELETE FROM player_loans');
    for (const pl of cache.profiles.playerLoans || []) {
      const borrowerPgId = await ensureUserPgId(client, pl.borrowerId);
      const lenderPgId = await ensureUserPgId(client, pl.lenderId);
      if (!borrowerPgId || !lenderPgId) continue;
      await client.query(
        `INSERT INTO player_loans (borrower_id, lender_id, amount, interest_rate, due_date, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          borrowerPgId,
          lenderPgId,
          Number(pl.amount) || 0,
          Number(pl.interestRate) || 0,
          pl.dueDate ? new Date(pl.dueDate) : null,
          String(pl.status || 'active')
        ]
      );
    }

    // Multi-bet usage
    for (const [mId, usage] of Object.entries(cache.profiles.eventCasinoMultiBetUsage || {})) {
      const pgUserId = await ensureUserPgId(client, mId);
      if (!pgUserId) continue;
      await client.query(
        `INSERT INTO event_casino_multi_bet_usage (user_id, usage_count)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET usage_count = EXCLUDED.usage_count`,
        [pgUserId, Math.max(0, usage)]
      );
    }

    // Połączenia Last.fm
    for (const [mId, lfm] of Object.entries(cache.profiles.lastfmConnections || {})) {
      const pgUserId = await ensureUserPgId(client, mId);
      if (!pgUserId) continue;
      await client.query(
        `INSERT INTO lastfm_connections (user_id, username, incognito)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET
           username = EXCLUDED.username,
           incognito = EXCLUDED.incognito`,
        [pgUserId, String(lfm.username), Boolean(lfm.incognito)]
      );
    }

    // Logi (zapisujemy te nowe z cache.logs)
    const logsRes = await client.query('SELECT id FROM logs');
    const existingLogIds = new Set(logsRes.rows.map(r => String(r.id)));
    for (const l of cache.logs || []) {
      if (existingLogIds.has(l.id)) continue; // Już jest w bazie
      const pgUserId = l.userId ? await ensureUserPgId(client, l.userId) : null;
      await client.query(
        `INSERT INTO logs (user_id, thread_id, action, details, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [pgUserId, l.threadId, l.action, JSON.stringify(l.details || {}), new Date(l.timestamp)]
      );
    }

    // Zapisywanie dynamicznych adminów i konfiguracji w game_config
    const syncGc = {
      'active_events': cache.profiles.activeEvents || [],
      'true_blacklist': cache.profiles.trueBlacklist || [],
      'admin_daily_usage': cache.cooldowns.adminDailyUsage || {}
    };

    for (const [key, val] of Object.entries(syncGc)) {
      await client.query(
        `INSERT INTO game_config (key, value, value_type)
         VALUES ($1, $2, 'json')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify(val)]
      );
    }

    // Ostrzeżenia spamowe zapisujemy bezpośrednio do tabeli spam_entries (warning_count)
    if (cache.profiles.spamWarnings) {
      for (const [mId, count] of Object.entries(cache.profiles.spamWarnings)) {
        const pgUserId = await ensureUserPgId(client, mId);
        if (!pgUserId) continue;
        await client.query(
          `INSERT INTO spam_entries (user_id, warning_count)
           VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE SET warning_count = EXCLUDED.warning_count`,
          [pgUserId, count]
        );
      }
    }

    // Zapętlenia startup broadcast
    if (cache.profiles.startupBroadcastDone) {
      for (const [key, val] of Object.entries(cache.profiles.startupBroadcastDone)) {
        await client.query(
          `INSERT INTO game_config (key, value, value_type)
           VALUES ($1, $2, 'json')
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [`broadcast_${key}`, JSON.stringify({ done: val })]
        );
      }
    }

    // Zapisz/aktualizuj aktywne zakłady
    await client.query('DELETE FROM active_bets');
    if (cache.activeBets) {
      for (const [messengerId, bet] of Object.entries(cache.activeBets)) {
        const pgUserId = await ensureUserPgId(client, messengerId);
        if (!pgUserId) continue;
        await client.query(
          `INSERT INTO active_bets (thread_id, host_id, game_type, stake, players, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            String(bet.threadId || ''),
            pgUserId,
            String(bet.gameType || ''),
            Math.max(0, Number(bet.stake) || 0),
            JSON.stringify(bet.players || {}),
            String(bet.status || 'waiting'),
            bet.createdAt ? new Date(bet.createdAt) : new Date()
          ]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[STORAGE] Błąd podczas zapisywania cache do bazy danych PostgreSQL:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Kolejkowanie transakcji w celu zachowania spójności sekwencyjnej
let writeQueue = Promise.resolve();

async function withData(callback) {
  const run = async () => {
    // 1. Zapewnij wczytanie cache z PostgreSQL lub z plików JSON
    if (USE_POSTGRES) {
      if (!isInitialized) {
        await initializeCache();
      }
    } else {
      ensureDataFiles();
      cache = {
        users: loadDataLocal('users'),
        profiles: loadDataLocal('profiles'),
        inventory: loadDataLocal('inventory'),
        cooldowns: loadDataLocal('cooldowns'),
        logs: loadDataLocal('logs'),
        groupStats: loadDataLocal('groupStats')
      };
    }

    // Klonowanie stanu w celu wykrycia późniejszego diffu
    const previousStateString = JSON.stringify(cache);

    // 2. Przekazujemy wczytany cache jako referencję do callbacku
    const result = await callback(cache);

    // 3. Sprawdzamy czy coś się zmieniło w cache i jeśli tak, zapisujemy to
    const currentStateString = JSON.stringify(cache);
    if (currentStateString !== previousStateString) {
      if (USE_POSTGRES) {
        await saveCacheToDatabase();
      } else {
        saveDataLocal('users', cache.users);
        saveDataLocal('profiles', cache.profiles);
        saveDataLocal('inventory', cache.inventory);
        saveDataLocal('cooldowns', cache.cooldowns);
        saveDataLocal('logs', cache.logs);
        saveDataLocal('groupStats', cache.groupStats);
      }
    }

    return result;
  };

  const next = writeQueue.then(run, run);
  writeQueue = next.catch(() => undefined);
  return next;
}

module.exports = {
  DATA_DIR,
  DATA_FILES,
  ensureDataFiles,
  loadData,
  saveData,
  getUser,
  createUser,
  updateUser,
  appendLog,
  withData,
  initializeCache
};
