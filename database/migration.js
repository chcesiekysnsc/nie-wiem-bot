/**
 * MIGRACJA Z JSON NA POSTGRESQL
 *
 * Uruchomienie:
 *  1. Ustaw DATABASE_URL w .env
 *  2. Wklej schema.sql w Supabase SQL Editor
 *  3. node migration.js
 *
 * Wymagania:
 *  npm install pg dotenv
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../utils/storage');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const BACKUP_DIR = path.join(__dirname, '..', 'backup', 'json');

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function backupFile(fileName) {
  ensureBackupDir();
  const src = path.join(DATA_DIR, fileName);
  const dst = path.join(BACKUP_DIR, fileName);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`  [BACKUP] ${fileName} → ${dst}`);
  }
}

function readJson(fileName, fallback = {}) {
  const filePath = path.join(DATA_DIR, fileName);
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`  [WARN] Nie udało się odczytać ${fileName}: ${err.message}`);
    return fallback;
  }
}

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('=== ROZPOCZYNAM MIGRACJĘ ===\n');

    // Backup plików przed migracją
    console.log('[1/8] Backup starych plików JSON...');
    const filesToBackup = [
      'users.json',
      'profiles.json',
      'inventory.json',
      'cooldowns.json',
      'groupStats.json',
      'logs.json',
      'active_bets.json',
      'active_threads.json'
    ];
    for (const file of filesToBackup) {
      backupFile(file);
    }

    // --------------------------------------------------------
    // 2. UŻYTKOWNICY
    // --------------------------------------------------------
    console.log('[2/8] Migracja użytkowników...');
    const users = readJson('users.json', {});
    const userIdMap = {}; // old string id -> new bigint id
    let migratedUsers = 0;

    for (const [oldId, user] of Object.entries(users)) {
      const res = await client.query(
        `INSERT INTO users (
          messenger_id, name, balance, bank, level, xp, prestige,
          badges, married_to, daily_cooldown, message_count,
          group_messages, command_counts, company_id, company2_id,
          gang_id, last_active_thread_id, default_city,
          opened_packages_today, last_package_open_date, negative_since,
          active_loan, blacklisted_for_negative_balance,
          claimed_milestones, bio, last_work_time
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14, $15,
          $16, $17, $18,
          $19, $20, $21,
          $22, $23,
          $24, $25, $26
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
          company_id = EXCLUDED.company_id,
          company2_id = EXCLUDED.company2_id,
          gang_id = EXCLUDED.gang_id,
          last_active_thread_id = EXCLUDED.last_active_thread_id,
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
          String(user.id || oldId),
          user.name || null,
          Math.max(0, Number(user.balance) || 0),
          Math.max(0, Number(user.bank) || 0),
          Math.max(1, Math.floor(Number(user.level) || 1)),
          Math.max(0, Math.floor(Number(user.xp) || 0)),
          Math.max(0, Math.floor(Number(user.prestige) || 0)),
          Array.isArray(user.badges) ? user.badges : [],
          user.marriedTo ? String(user.marriedTo) : null,
          user.dailyCooldown ? new Date(Number(user.dailyCooldown)) : null,
          Math.max(0, Number(user.messageCount) || 0),
          JSON.stringify(user.groupMessages || {}),
          JSON.stringify(user.commandCounts || {}),
          user.company?.id || null,
          user.company2?.id || null,
          user.gangId || null,
          user.lastActiveThreadId || null,
          user.defaultCity || null,
          Math.max(0, Number(user.openedPackagesToday) || 0),
          user.lastPackageOpenDate || null,
          user.negativeSince ? new Date(Number(user.negativeSince)) : null,
          user.activeLoan ? JSON.stringify(user.activeLoan) : null,
          Boolean(user.blacklistedForNegativeBalance),
          Array.isArray(user.claimedMilestones) ? user.claimedMilestones : [],
          String(user.bio || ''),
          user.lastWorkTime ? new Date(Number(user.lastWorkTime)) : null
        ]
      );

      const newId = res.rows[0].id;
      userIdMap[oldId] = newId;
      migratedUsers++;
    }
    console.log(`  Zmi­growano ${migratedUsers} użytkowników`);

    // --------------------------------------------------------
    // 3. GANGI
    // --------------------------------------------------------
    console.log('[3/8] Migracja gangów...');
    const profiles = readJson('profiles.json', {});
    const gangs = profiles.gangs || {};
    const gangIdMap = {}; // old string id -> new bigint id
    let migratedGangs = 0;

    for (const [oldId, gang] of Object.entries(gangs)) {
      const res = await client.query(
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
          String(gang.name || oldId),
          gang.bossId ? String(gang.bossId) : null,
          Math.max(0, Number(gang.vault) || 0),
          Math.max(0, Math.floor(Number(gang.levelDziupla) || 0)),
          Math.max(0, Math.floor(Number(gang.levelBiznesy) || 0)),
          Math.max(0, Math.floor(Number(gang.levelFach) || 0)),
          Math.max(0, Math.floor(Number(gang.reputation) || 0)),
          Math.max(0, Math.min(100, Math.floor(Number(gang.tributePercent) || 0))),
          gang.lastHeistTime ? new Date(Number(gang.lastHeistTime)) : null,
          gang.lastAttackTime ? new Date(Number(gang.lastAttackTime)) : null,
          gang.lastTerritoryCaptureAt ? new Date(Number(gang.lastTerritoryCaptureAt)) : null,
          gang.shieldUntil ? new Date(Number(gang.shieldUntil)) : null,
          gang.lastSupportTime ? new Date(Number(gang.lastSupportTime)) : null
        ]
      );

      const newGangId = res.rows[0].id;
      gangIdMap[oldId] = newGangId;
      migratedGangs++;
    }
    console.log(`  Zmigrowano ${migratedGangs} gangów`);

    // Członkowie gangów
    console.log('  Migracja członków gangów...');
    let migratedMembers = 0;
    for (const [oldGangId, gang] of Object.entries(gangs)) {
      const newGangId = gangIdMap[oldGangId];
      if (!newGangId) continue;

      const members = Array.isArray(gang.members) ? gang.members : [];
      const deputies = Array.isArray(gang.deputies) ? gang.deputies : [];

      for (const memberId of members) {
        const newMemberId = userIdMap[String(memberId)];
        if (!newMemberId) continue;

        const role = deputies.includes(memberId) ? 'deputy' : 'member';
        await client.query(
          `INSERT INTO gang_members (gang_id, user_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (gang_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
          [newGangId, newMemberId, role]
        );
        migratedMembers++;
      }
    }
    console.log(`  Zmigrowano ${migratedMembers} członków`);

    // Depozyty gangów
    console.log('  Migracja depozytów gangów...');
    let migratedDeposits = 0;
    for (const [oldGangId, gang] of Object.entries(gangs)) {
      const newGangId = gangIdMap[oldGangId];
      if (!newGangId) continue;

      const deposits = gang.deposits || {};
      for (const [userId, amount] of Object.entries(deposits)) {
        const newUserId = userIdMap[String(userId)];
        if (!newUserId) continue;

        await client.query(
          `INSERT INTO gang_deposits (gang_id, user_id, amount)
           VALUES ($1, $2, $3)
           ON CONFLICT (gang_id, user_id) DO UPDATE SET amount = EXCLUDED.amount`,
          [newGangId, newUserId, Math.max(0, Number(amount) || 0)]
        );
        migratedDeposits++;
      }
    }
    console.log(`  Zmigrowano ${migratedDeposits} depozytów`);

    // Sojusz gangów
    console.log('  Migracja sojuszy...');
    let migratedAlliances = 0;
    for (const [oldGangId, gang] of Object.entries(gangs)) {
      const newGangId = gangIdMap[oldGangId];
      if (!newGangId) continue;

      const alliances = Array.isArray(gang.alliances) ? gang.alliances : [];
      for (const allyId of alliances) {
        const newAllyId = gangIdMap[allyId];
        if (!newAllyId || newAllyId === newGangId) continue;

        await client.query(
          `INSERT INTO gang_alliances (gang_id, ally_gang_id)
           VALUES ($1, $2)
           ON CONFLICT (gang_id, ally_gang_id) DO NOTHING`,
          [newGangId, newAllyId]
        );
        migratedAlliances++;
      }
    }
    console.log(`  Zmigrowano ${migratedAlliances} sojuszy`);

    // --------------------------------------------------------
    // 4. EKWIPUNEK
    // --------------------------------------------------------
    console.log('[4/8] Migracja ekwipunku...');
    const inventory = readJson('inventory.json', {});
    let migratedInventory = 0;

    for (const [oldUserId, items] of Object.entries(inventory)) {
      const newUserId = userIdMap[oldUserId];
      if (!newUserId) continue;

      for (const [itemId, amount] of Object.entries(items)) {
        if (Number(amount) <= 0) continue;

        await client.query(
          `INSERT INTO inventory (user_id, item_id, amount)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, item_id) DO UPDATE SET amount = EXCLUDED.amount`,
          [newUserId, String(itemId), Math.max(0, Math.floor(Number(amount)))]
        );
        migratedInventory++;
      }
    }
    console.log(`  Zmigrowano ${migratedInventory} przedmiotów`);

    // --------------------------------------------------------
    // 5. COOLDOWNY
    // --------------------------------------------------------
    console.log('[5/8] Migracja cooldownów...');
    const cooldowns = readJson('cooldowns.json', {});
    let migratedCooldowns = 0;

    const commands = cooldowns.commands || {};
    for (const [oldUserId, userCooldowns] of Object.entries(commands)) {
      const newUserId = userIdMap[oldUserId];
      if (!newUserId || !userCooldowns) continue;

      for (const [commandName, expiresAt] of Object.entries(userCooldowns)) {
        const ts = Number(expiresAt);
        if (!Number.isFinite(ts) || ts <= 0) continue;

        await client.query(
          `INSERT INTO command_cooldowns (user_id, command_name, expires_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, command_name) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
          [newUserId, String(commandName), new Date(ts)]
        );
        migratedCooldowns++;
      }
    }
    console.log(`  Zmigrowano ${migratedCooldowns} cooldownów`);

    // Spam entries
    console.log('  Migracja wpisów spam...');
    let migratedSpam = 0;
    const spam = cooldowns.spam || {};
    for (const [oldUserId, entry] of Object.entries(spam)) {
      const newUserId = userIdMap[oldUserId];
      if (!newUserId || !entry) continue;

      const timestamps = Array.isArray(entry.timestamps)
        ? entry.timestamps.filter(t => Number.isFinite(t)).map(t => new Date(Number(t)))
        : [];
      const blockedUntil = Number.isFinite(entry.blockedUntil) ? new Date(Number(entry.blockedUntil)) : null;

      await client.query(
        `INSERT INTO spam_entries (user_id, timestamps, blocked_until, warning_count, blacklisted)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           timestamps = EXCLUDED.timestamps,
           blocked_until = EXCLUDED.blocked_until,
           warning_count = EXCLUDED.warning_count,
           blacklisted = EXCLUDED.blacklisted`,
        [newUserId, timestamps, blockedUntil, Math.max(0, Number(entry.warningCount) || 0), Boolean(entry.blacklisted)]
      );
      migratedSpam++;
    }
    console.log(`  Zmigrowano ${migratedSpam} wpisów spam`);

    // Cooldown notifications
    console.log('  Migracja powiadomień cooldown...');
    const cooldownNotifications = cooldowns.cooldownNotifications || {};
    for (const [oldUserId, entry] of Object.entries(cooldownNotifications)) {
      const newUserId = userIdMap[oldUserId];
      if (!newUserId || !entry) continue;

      const timestamps = Array.isArray(entry.timestamps)
        ? entry.timestamps.filter(t => Number.isFinite(t)).map(t => new Date(Number(t)))
        : [];

      // Zapisujemy jako spam_entries żeby nie tracić danych
      await client.query(
        `UPDATE spam_entries SET timestamps = $1 WHERE user_id = $2`,
        [timestamps, newUserId]
      );
    }

    // --------------------------------------------------------
    // 6. STATYSTYKI GRUP
    // --------------------------------------------------------
    console.log('[6/8] Migracja statystyk grup...');
    const groupStats = readJson('groupStats.json', {});
    let migratedGroupStats = 0;

    for (const [threadId, stats] of Object.entries(groupStats)) {
      await client.query(
        `INSERT INTO groups (thread_id, prefix, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (thread_id) DO UPDATE SET
           prefix = EXCLUDED.prefix,
           name = EXCLUDED.name`,
        [String(threadId), stats.prefix || '!', stats.threadName || null]
      );

      const seenMessageIds = Array.isArray(stats.seenMessageIds) ? stats.seenMessageIds : [];
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
          first_use = EXCLUDED.first_use,
          last_updated = EXCLUDED.last_updated,
          seen_message_ids = EXCLUDED.seen_message_ids`,
        [
          String(threadId),
          stats.threadName || null,
          Math.max(0, Number(stats.visibleMessages) || 0),
          Math.max(0, Number(stats.processedMessages) || 0),
          Math.max(0, Number(stats.commandsExecuted) || 0),
          Math.max(0, Number(stats.mentionsCount) || 0),
          stats.firstUse ? new Date(Number(stats.firstUse)) : null,
          stats.lastUpdated ? new Date(Number(stats.lastUpdated)) : null,
          JSON.stringify(seenMessageIds)
        ]
      );
      migratedGroupStats++;
    }
    console.log(`  Zmigrowano ${migratedGroupStats} grup`);

    // --------------------------------------------------------
    // 7. AKTYWNE ZAKŁADY
    // --------------------------------------------------------
    console.log('[7/8] Migracja aktywnych zakładów...');
    const activeBets = readJson('active_bets.json', {});
    let migratedBets = 0;

    for (const [betId, bet] of Object.entries(activeBets)) {
      const hostId = bet.hostId ? userIdMap[String(bet.hostId)] : null;

      await client.query(
        `INSERT INTO active_bets (
          thread_id, host_id, game_type, stake, players, status, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7
        )
        ON CONFLICT (id) DO UPDATE SET
          thread_id = EXCLUDED.thread_id,
          host_id = EXCLUDED.host_id,
          game_type = EXCLUDED.game_type,
          stake = EXCLUDED.stake,
          players = EXCLUDED.players,
          status = EXCLUDED.status`,
        [
          String(bet.threadId || ''),
          hostId,
          String(bet.gameType || ''),
          Math.max(0, Number(bet.stake) || 0),
          JSON.stringify(bet.players || {}),
          String(bet.status || 'waiting'),
          bet.createdAt ? new Date(Number(bet.createdAt)) : new Date()
        ]
      );
      migratedBets++;
    }
    console.log(`  Zmigrowano ${migratedBets} zakładów`);

    // --------------------------------------------------------
    // 8. CZARNA LISTA, DODATKOWE DANE Z PROFILES
    // --------------------------------------------------------
    console.log('[8/8] Migracja dodatkowych danych...');

    // Czarna lista
    const blacklist = Array.isArray(profiles.blacklist) ? profiles.blacklist : [];
    for (const userId of blacklist) {
      await client.query(
        `INSERT INTO blacklist (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [String(userId)]
      );
    }
    console.log(`  Zmigrowano ${blacklist.length} wpisów na czarnej liście`);

    // Zakazane grupy
    const blacklistedGroups = Array.isArray(profiles.blacklistedGroups) ? profiles.blacklistedGroups : [];
    for (const threadId of blacklistedGroups) {
      await client.query(
        `INSERT INTO blacklisted_groups (thread_id) VALUES ($1) ON CONFLICT (thread_id) DO NOTHING`,
        [String(threadId)]
      );
    }
    console.log(`  Zmigrowano ${blacklistedGroups.length} zakazanych grup`);

    // Ustawienia wątków
    const threadSettings = profiles.threadSettings || {};
    let migratedThreadSettings = 0;
    for (const [threadId, settings] of Object.entries(threadSettings)) {
      await client.query(
        `INSERT INTO thread_settings (
          thread_id, prefix, loop_users, nickname_guards, unsend_logging_enabled
        ) VALUES (
          $1, $2, $3, $4, $5
        )
        ON CONFLICT (thread_id) DO UPDATE SET
          prefix = EXCLUDED.prefix,
          loop_users = EXCLUDED.loop_users,
          nickname_guards = EXCLUDED.nickname_guards,
          unsend_logging_enabled = EXCLUDED.unsend_logging_enabled`,
        [
          String(threadId),
          String(settings.prefix || '!'),
          JSON.stringify(Array.isArray(settings.loopUsers) ? settings.loopUsers : []),
          JSON.stringify(settings.nicknameGuards || {}),
          Boolean(settings.unsendLoggingEnabled)
        ]
      );
      migratedThreadSettings++;
    }
    console.log(`  Zmigrowano ${migratedThreadSettings} ustawień wątków`);

    // Dynamiczni administratorzy
    const dynamicAdmins = Array.isArray(profiles.dynamicAdmins) ? profiles.dynamicAdmins : [];
    for (const adminId of dynamicAdmins) {
      await client.query(
        `INSERT INTO game_config (key, value, value_type)
         VALUES ('dynamic_admin_$1', $2, 'json')
         ON CONFLICT (key) DO NOTHING`,
        [String(adminId), JSON.stringify({ adminId: String(adminId) })]
      );
    }

    // Ostrzeżenia spam
    const spamWarnings = profiles.spamWarnings || {};
    for (const [userId, count] of Object.entries(spamWarnings)) {
      const newUserId = userIdMap[String(userId)];
      if (!newUserId) continue;

      await client.query(
        `INSERT INTO spam_entries (user_id, warning_count)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET warning_count = EXCLUDED.warning_count`,
        [newUserId, Math.max(0, Number(count) || 0)]
      );
    }

    // Ostrzeżenia propozycji
    const proposalModeration = profiles.proposalModeration || {};
    for (const [userId, data] of Object.entries(proposalModeration)) {
      const newUserId = userIdMap[String(userId)];
      if (!newUserId) continue;

      await client.query(
        `INSERT INTO proposal_moderation (user_id, warnings, banned)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET
           warnings = EXCLUDED.warnings,
           banned = EXCLUDED.banned`,
        [newUserId, Math.max(0, Number(data.warnings) || 0), Boolean(data.banned)]
      );
    }

    // AFK użytkownicy
    const afk = profiles.afk || {};
    for (const [userId, data] of Object.entries(afk)) {
      const newUserId = userIdMap[String(userId)];
      if (!newUserId) continue;

      await client.query(
        `INSERT INTO afk_users (user_id, reason, enabled, time)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET
           reason = EXCLUDED.reason,
           enabled = EXCLUDED.enabled,
           time = EXCLUDED.time`,
        [newUserId, String(data.reason || ''), Boolean(data.enabled), new Date(Number(data.time) || Date.now())]
      );
    }

    // Override szans
    const chanceOverrides = profiles.chanceOverrides || {};
    for (const [userId, overrides] of Object.entries(chanceOverrides)) {
      const newUserId = userIdMap[String(userId)];
      if (!newUserId || !overrides) continue;

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
          newUserId,
          overrides.crime_success !== undefined ? Number(overrides.crime_success) : null,
          overrides.rob_success !== undefined ? Number(overrides.rob_success) : null,
          overrides.work_luck !== undefined ? Number(overrides.work_luck) : null,
          overrides.box_drop_luck !== undefined ? Number(overrides.box_drop_luck) : null,
          overrides.company_breakdown !== undefined ? Number(overrides.company_breakdown) : null,
          overrides.gang_heist_success !== undefined ? Number(overrides.gang_heist_success) : null,
          overrides.lottery_ticket_mult !== undefined ? Number(overrides.lottery_ticket_mult) : null,
          overrides.gielda_luck !== undefined ? Number(overrides.gielda_luck) : null,
          overrides.coinflip_win !== undefined ? Number(overrides.coinflip_win) : null,
          overrides.roulette_win_luck !== undefined ? Number(overrides.roulette_win_luck) : null,
          overrides.slots_win_luck !== undefined ? Number(overrides.slots_win_luck) : null,
          overrides.rr_solo_survive !== undefined ? Number(overrides.rr_solo_survive) : null,
          overrides.rr_duel_bullet !== undefined ? Number(overrides.rr_duel_bullet) : null,
          overrides.blackjack_save_luck !== undefined ? Number(overrides.blackjack_save_luck) : null,
          overrides.bet_win_luck !== undefined ? Number(overrides.bet_win_luck) : null
        ]
      );
    }

    // Pożyczki graczy
    const playerLoans = Array.isArray(profiles.playerLoans) ? profiles.playerLoans : [];
    for (const loan of playerLoans) {
      const borrowerId = loan.borrowerId ? userIdMap[String(loan.borrowerId)] : null;
      const lenderId = loan.lenderId ? userIdMap[String(loan.lenderId)] : null;
      if (!borrowerId || !lenderId) continue;

      await client.query(
        `INSERT INTO player_loans (borrower_id, lender_id, amount, interest_rate, due_date, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          borrowerId,
          lenderId,
          Math.max(0, Number(loan.amount) || 0),
          Number(loan.interestRate) || 0,
          loan.dueDate ? new Date(Number(loan.dueDate)) : null,
          String(loan.status || 'active')
        ]
      );
    }

    // Właściciele lombardów
    const pawnOwners = profiles.pawnOwners || {};
    for (const [itemId, ownerId] of Object.entries(pawnOwners)) {
      const newOwnerId = userIdMap[String(ownerId)];
      if (!newOwnerId) continue;

      await client.query(
        `INSERT INTO game_config (key, value, value_type)
         VALUES ($1, $2, 'json')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [`pawn_owner_${itemId}`, JSON.stringify({ ownerId: newOwnerId, itemId: String(itemId) })]
      );
    }

    // Adresaci logowania broadcast
    const broadcastDone = profiles.startupBroadcastDone || {};
    for (const [key, value] of Object.entries(broadcastDone)) {
      await client.query(
        `INSERT INTO game_config (key, value, value_type)
         VALUES ($1, $2, 'json')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [`broadcast_${key}`, JSON.stringify({ done: value })]
      );
    }

    // Włączenie/wyłączenie komend na grupach
    const disabledCommands = Array.isArray(profiles.disabledCommands) ? profiles.disabledCommands : [];
    for (const command of disabledCommands) {
      await client.query(
        `INSERT INTO game_config (key, value, value_type)
         VALUES ($1, $2, 'json')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [`disabled_command_${command}`, JSON.stringify({ command, disabled: true })]
      );
    }

    // Połączenia Last.fm
    const lastfmConnections = profiles.lastfmConnections || {};
    for (const [userId, conn] of Object.entries(lastfmConnections)) {
      const newUserId = userIdMap[String(userId)];
      if (!newUserId) continue;

      await client.query(
        `INSERT INTO lastfm_connections (user_id, username, incognito)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET
           username = EXCLUDED.username,
           incognito = EXCLUDED.incognito`,
        [newUserId, String(conn.username || ''), Boolean(conn.incognito)]
      );
    }

    // Ustawienia prefixów grup
    const groupPrefixes = profiles.groupPrefixes || {};
    for (const [threadId, prefix] of Object.entries(groupPrefixes)) {
      await client.query(
        `UPDATE groups SET prefix = $1 WHERE thread_id = $2`,
        [String(prefix), String(threadId)]
      );
    }

    // Podatki
    await client.query(
      `UPDATE game_taxes SET rate = $1 WHERE tax_type = 'balance'`,
      [Number(profiles.balanceTaxRate) || 15]
    );
    await client.query(
      `UPDATE game_taxes SET rate = $1 WHERE tax_type = 'transfer'`,
      [Number(profiles.transferTaxRate) || 5]
    );
    await client.query(
      `UPDATE game_taxes SET rate = $1 WHERE tax_type = 'market'`,
      [Number(profiles.marketTaxRate) || 10]
    );
    await client.query(
      `UPDATE game_taxes SET rate = $1 WHERE tax_type = 'gang_tribute'`,
      [Number(profiles.gangTributeRate) || 0]
    );
    await client.query(
      `UPDATE game_taxes SET rate = $1 WHERE tax_type = 'casino'`,
      [Number(profiles.casinoTaxRate) || 15]
    );
    await client.query(
      `UPDATE game_taxes SET rate = $1 WHERE tax_type = 'mecz'`,
      [Number(profiles.meczTaxRate) || 15]
    );

    // Rynek
    const market = Array.isArray(profiles.market) ? profiles.market : [];
    for (const listing of market) {
      const sellerId = listing.sellerId ? userIdMap[String(listing.sellerId)] : null;
      if (!sellerId) continue;

      await client.query(
        `INSERT INTO market_listings (listing_id, seller_id, item_id, price, listed_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (listing_id) DO UPDATE SET
           seller_id = EXCLUDED.seller_id,
           item_id = EXCLUDED.item_id,
           price = EXCLUDED.price`,
        [
          String(listing.listingId),
          sellerId,
          String(listing.itemId),
          Math.max(0, Number(listing.price) || 0),
          listing.listedAt ? new Date(Number(listing.listedAt)) : new Date()
        ]
      );
    }

    // Zwycięzcy miesięczni
    const lastResetWinners = Array.isArray(profiles.lastResetWinners) ? profiles.lastResetWinners : [];
    for (const winner of lastResetWinners) {
      const userId = winner.userId ? userIdMap[String(winner.userId)] : null;
      if (!userId) continue;

      await client.query(
        `INSERT INTO monthly_winners (user_id, period, total, item)
         VALUES ($1, $2, $3, $4)`,
        [
          userId,
          `${profiles.lastResetYear || new Date().getFullYear()}-${String(profiles.lastResetMonth || new Date().getMonth() + 1).padStart(2, '0')}`,
          Math.max(0, Number(winner.total) || 0),
          String(winner.item || '')
        ]
      );
    }

    // AI dozwolone użytkownicy
    const allowedAI = Array.isArray(profiles.allowedAI) ? profiles.allowedAI : [];
    for (const entry of allowedAI) {
      const userId = typeof entry === 'string' ? entry : entry.id;
      const newUserId = userIdMap[String(userId)];
      if (!newUserId) continue;

      const dailyLimit = typeof entry === 'object' && entry.dailyLimit ? Number(entry.dailyLimit) : null;
      const addedAt = typeof entry === 'object' && entry.addedAt ? new Date(Number(entry.addedAt)) : new Date();

      await client.query(
        `INSERT INTO game_config (key, value, value_type)
         VALUES ($1, $2, 'json')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [
          `ai_allowed_${newUserId}`,
          JSON.stringify({
            userId: newUserId,
            dailyLimit: dailyLimit,
            addedAt: addedAt.toISOString()
          })
        ]
      );
    }

    // Koordynaty cooldownów grupowych AI
    const aiGroupCooldowns = profiles.aiGroupCooldowns || {};
    for (const [threadId, timestamp] of Object.entries(aiGroupCooldowns)) {
      await client.query(
        `INSERT INTO ai_group_cooldowns (thread_id, last_used)
         VALUES ($1, $2)
         ON CONFLICT (thread_id) DO UPDATE SET last_used = EXCLUDED.last_used`,
        [String(threadId), new Date(Number(timestamp))]
      );
    }

    // Włączenie/wyłączenie eventu kasyna multi-bet
    const eventCasinoMultiBetUsage = profiles.eventCasinoMultiBetUsage || {};
    for (const [userId, usage] of Object.entries(eventCasinoMultiBetUsage)) {
      const newUserId = userIdMap[String(userId)];
      if (!newUserId) continue;

      await client.query(
        `INSERT INTO event_casino_multi_bet_usage (user_id, usage_count)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET usage_count = EXCLUDED.usage_count`,
        [newUserId, Math.max(0, Number(usage) || 0)]
      );
    }

    // Uprawnienia komend użytkowników
    const userCommandPermissions = profiles.userCommandPermissions || {};
    for (const [userId, permissions] of Object.entries(userCommandPermissions)) {
      const newUserId = userIdMap[String(userId)];
      if (!newUserId) continue;

      for (const [command, allowed] of Object.entries(permissions)) {
        await client.query(
          `INSERT INTO user_command_permissions (user_id, command_name, allowed)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, command_name) DO UPDATE SET allowed = EXCLUDED.allowed`,
          [newUserId, String(command), Boolean(allowed)]
        );
      }
    }

    // Postęp danegrp
    const danegrpProgress = profiles.danegrpProgress || {};
    if (danegrpProgress.totalGroups || danegrpProgress.processedGroups) {
      await client.query(
        `INSERT INTO game_config (key, value, value_type)
         VALUES ('danegrp_progress', $1, 'json')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(danegrpProgress)]
      );
    }

    // Aktywne gry blackjacka
    const activeBlackjackGames = profiles.activeBlackjackGames || {};
    for (const [userId, game] of Object.entries(activeBlackjackGames)) {
      const newUserId = userIdMap[String(userId)];
      if (!newUserId || !game) continue;

      await client.query(
        `INSERT INTO active_blackjack_games (
          user_id, bet, player_cards, dealer_cards, deck, thread_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6
        )
        ON CONFLICT (user_id) DO UPDATE SET
          bet = EXCLUDED.bet,
          player_cards = EXCLUDED.player_cards,
          dealer_cards = EXCLUDED.dealer_cards,
          deck = EXCLUDED.deck,
          thread_id = EXCLUDED.thread_id`,
        [
          newUserId,
          Math.max(0, Number(game.bet) || 0),
          JSON.stringify(game.playerCards || []),
          JSON.stringify(game.dealerCards || []),
          JSON.stringify(game.deck || []),
          String(game.threadId || '')
        ]
      );
    }

    // Ostatnie wypłaty czarnej karty
    if (profiles.lastCzarnaKartaPayout) {
      await client.query(
        `INSERT INTO game_config (key, value, value_type)
         VALUES ('last_czarna_karta_payout', $1, 'json')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify({ timestamp: Number(profiles.lastCzarnaKartaPayout) })]
      );
    }

    // Ostatnie odsetki
    if (profiles.lastInterestPayout) {
      await client.query(
        `INSERT INTO game_config (key, value, value_type)
         VALUES ('last_interest_payout', $1, 'json')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify({ timestamp: Number(profiles.lastInterestPayout) })]
      );
    }

    // Aktywne eventy (przechowujemy jako JSON w game_config)
    const activeEvents = Array.isArray(profiles.activeEvents) ? profiles.activeEvents : [];
    await client.query(
      `INSERT INTO game_config (key, value, value_type)
       VALUES ('active_events', $1, 'json')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(activeEvents)]
    );

    // Nastepny podatek
    if (profiles.nextTaxCollectionAt) {
      await client.query(
        `INSERT INTO game_config (key, value, value_type)
         VALUES ('next_tax_collection_at', $1, 'json')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify({ timestamp: Number(profiles.nextTaxCollectionAt) })]
      );
    }

    // Stan bota
    const botStatus = profiles.botStatus || {};
    await client.query(
      `INSERT INTO bot_status (id, logged_in, bot_id, active_threads)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         logged_in = EXCLUDED.logged_in,
         bot_id = EXCLUDED.bot_id,
         active_threads = EXCLUDED.active_threads`,
      [
        Boolean(botStatus.loggedIn),
        botStatus.botId ? String(botStatus.botId) : null,
        Math.max(0, Number(botStatus.activeThreads) || 0)
      ]
    );

    // Oczekujące broadcasty admina
    const pendingAdminBroadcasts = Array.isArray(profiles.pendingAdminBroadcasts) ? profiles.pendingAdminBroadcasts : [];
    await client.query(
      `INSERT INTO game_config (key, value, value_type)
       VALUES ('pending_admin_broadcasts', $1, 'json')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(pendingAdminBroadcasts)]
    );

    // Oczekujący restart admina
    if (profiles.pendingAdminRestart) {
      await client.query(
        `INSERT INTO game_config (key, value, value_type)
         VALUES ('pending_admin_restart', $1, 'json')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify({ pending: true })]
      );
    }

    // Custom cooldowny
    const customCooldowns = profiles.customCooldowns || {};
    for (const [key, value] of Object.entries(customCooldowns)) {
      await client.query(
        `INSERT INTO game_config (key, value, value_type)
         VALUES ($1, $2, 'json')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [`custom_cooldown_${key}`, JSON.stringify({ key, value })]
      );
    }

    // Wszystkie eventy z configu
    const configEvents = profiles.events || [];
    for (const event of configEvents) {
      await client.query(
        `INSERT INTO game_events (
          id, name, type, multiplier, cooldown_reduction, discount_percent,
          reward_multiplier, requirements, starts_at, ends_at, active
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        )
        ON CONFLICT (id) DO UPDATE SET
          multiplier = EXCLUDED.multiplier,
          cooldown_reduction = EXCLUDED.cooldown_reduction,
          discount_percent = EXCLUDED.discount_percent,
          reward_multiplier = EXCLUDED.reward_multiplier,
          ends_at = EXCLUDED.ends_at,
          active = EXCLUDED.active`,
        [
          String(event.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
          String(event.name || 'Event'),
          String(event.type || 'general'),
          Number(event.multiplier) || 1,
          Number(event.cooldownReduction || event.reductionPercent || 0),
          Number(event.discountPercent || 0),
          Number(event.rewardMultiplier || 1),
          JSON.stringify(event.requirements || {}),
          event.startsAt ? new Date(Number(event.startsAt)) : new Date(),
          event.endTime ? new Date(Number(event.endTime)) : null,
          Boolean(event.active !== false)
        ]
      );
    }

    // Wszystkie eventy activeEvents
    const activeEventsList = Array.isArray(profiles.activeEvents) ? profiles.activeEvents : [];
    for (const event of activeEventsList) {
      await client.query(
        `INSERT INTO game_events (
          name, type, multiplier, cooldown_reduction, discount_percent,
          reward_multiplier, requirements, starts_at, ends_at, active
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
        ON CONFLICT (id) DO UPDATE SET
          multiplier = EXCLUDED.multiplier,
          cooldown_reduction = EXCLUDED.cooldown_reduction,
          discount_percent = EXCLUDED.discount_percent,
          reward_multiplier = EXCLUDED.reward_multiplier,
          ends_at = EXCLUDED.ends_at,
          active = EXCLUDED.active`,
        [
          String(event.name || 'Active Event'),
          String(event.type || 'general'),
          Number(event.multiplier) || 1,
          Number(event.cooldownReduction || event.reductionPercent || 0),
          Number(event.discountPercent || 0),
          Number(event.rewardMultiplier || 1),
          JSON.stringify(event.requirements || {}),
          event.startsAt ? new Date(Number(event.startsAt)) : new Date(),
          event.endTime ? new Date(Number(event.endTime)) : null,
          true
        ]
      );
    }

    // --------------------------------------------------------
    // 9. DEFINICJE TERYTORIÓW (z configu)
    // --------------------------------------------------------
    console.log('[Dodatkowe] Migracja definicji terytoriów...');
    const config = require('../config/config');
    const territoryDefs = (config.territories && config.territories.definitions) || [];
    for (const t of territoryDefs) {
      await client.query(
        `INSERT INTO territory_definitions (id, name, emoji, description, bonus_type, bonus_value)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           emoji = EXCLUDED.emoji,
           description = EXCLUDED.description,
           bonus_type = EXCLUDED.bonus_type,
           bonus_value = EXCLUDED.bonus_value`,
        [
          String(t.id),
          String(t.name),
          String(t.emoji || ''),
          String(t.description || ''),
          String(t.bonusType || ''),
          Number(t.bonusValue) || 0
        ]
      );
    }

    // Stan terytoriów (jeśli istnieją)
    const territoriesState = profiles.territories || {};
    if (territoriesState.activeIds && territoriesState.owners) {
      const activeIds = Array.isArray(territoriesState.activeIds) ? territoriesState.activeIds : [];
      const owners = territoriesState.owners || {};

      for (const defId of activeIds) {
        const ownerId = owners[defId] || null;
        const newOwnerGangId = ownerId ? gangIdMap[ownerId] : null;

        await client.query(
          `INSERT INTO territories (definition_id, owner_gang_id, is_active, next_rotation_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (definition_id) DO UPDATE SET
             owner_gang_id = EXCLUDED.owner_gang_id,
             is_active = EXCLUDED.is_active`,
          [
            String(defId),
            newOwnerGangId,
            true,
            territoriesState.nextRotationAt ? new Date(Number(territoriesState.nextRotationAt)) : null
          ]
        );
      }
    }

    // --------------------------------------------------------
    // 10. WSZYSTKIE COMMIT
    // --------------------------------------------------------
    await client.query('COMMIT');
    console.log('\n=== MIGRACJA ZAKOŃCZONA SUKCESEM ===');
    console.log(`\nPodsumowanie:`);
    console.log(`  Użytkowników: ${migratedUsers}`);
    console.log(`  Gangów: ${migratedGangs}`);
    console.log(`  Członków gangów: ${migratedMembers}`);
    console.log(`  Depozytów: ${migratedDeposits}`);
    console.log(`  Sojuszy: ${migratedAlliances}`);
    console.log(`  Przedmiotów w ekwipunku: ${migratedInventory}`);
    console.log(`  Cooldownów: ${migratedCooldowns}`);
    console.log(`  Wpisów spam: ${migratedSpam}`);
    console.log(`  Statystyk grup: ${migratedGroupStats}`);
    console.log(`  Zakładów: ${migratedBets}`);
    console.log(`  Ustawień wątków: ${migratedThreadSettings}`);
    console.log(`\nBackup starych plików JSON: ${BACKUP_DIR}`);
    console.log(`\nNastępne kroki:`);
    console.log(`  1. Sprawdź dane w Supabase Dashboard`);
    console.log(`  2. Zmień kod bota aby używał PostgreSQL`);
    console.log(`  3. Ustaw DATABASE_URL w .env`);
    console.log(`  4. Uruchom bota`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n=== BŁĄD MIGRACJI ===');
    console.error(err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migracja nie powiodła się:', err);
  process.exit(1);
});
