const fs = require('fs');
const path = require('path');

console.log('=== Rozpoczynam pełne przywracanie ekosystemu bota ===');

// Ścieżki do plików
const USERS_PATH = path.resolve('data/users.json');
const USERS_SEED_PATH = path.resolve('data_seed/users.json');
const USERS_BACKUP_PATH = path.resolve('C:/Users/dupek/.gemini/antigravity/db_backups/users.json');

const PROFILES_PATH = path.resolve('data/profiles.json');
const PROFILES_SEED_PATH = path.resolve('data_seed/profiles.json');
const PROFILES_BACKUP_PATH = path.resolve('C:/Users/dupek/.gemini/antigravity/db_backups/profiles.json');

const OLD_BACKUP_USERS = path.resolve('data_backup_before_restore_20260827_234536/users.json');
const OLD_BACKUP_PROFILES = path.resolve('data_backup_before_restore_20260827_234536/profiles.json');

const users = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
const profiles = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
const oldUsers = fs.existsSync(OLD_BACKUP_USERS) ? JSON.parse(fs.readFileSync(OLD_BACKUP_USERS, 'utf8')) : {};
const oldProfiles = fs.existsSync(OLD_BACKUP_PROFILES) ? JSON.parse(fs.readFileSync(OLD_BACKUP_PROFILES, 'utf8')) : {};

// ==========================================
// 1. DOMY (HOUSE & HOUSE2)
// ==========================================
console.log('\n--- 1. Przywracanie Domów ---');

// Wojciech Wiśniewski: Rezydencja (tier 5, warsztat 5, silownia 5) + Willa (tier 4)
if (users['100012870817390']) {
  users['100012870817390'].house = {
    tier: 5,
    upgrades: { warsztat: 5, zbrojownia: 0, silownia: 5 },
    lastRentPaid: 1788698500000
  };
  users['100012870817390'].house2 = {
    tier: 4,
    upgrades: { warsztat: 0, zbrojownia: 0, silownia: 0 },
    lastRentPaid: 1788698500000
  };
  console.log('Przywrócono Rezydencję (max ulepszenia) oraz Willę dla Wojciecha Wiśniewskiego.');
}

// Rafał Oleksy: Willa (tier 4)
if (users['100060812419294']) {
  users['100060812419294'].house = {
    tier: 4,
    upgrades: { warsztat: 0, zbrojownia: 0, silownia: 0 },
    lastRentPaid: 1788698500000
  };
  console.log('Przywrócono Willę (tier 4) dla Rafała Oleksego.');
}

// ==========================================
// 2. ULEPSZENIA GANGÓW (levelBiznesy & levelFach)
// ==========================================
console.log('\n--- 2. Przywracanie Ulepszeń Gangów ---');

const GANG_UPGRADES = {
  wkf: { levelDziupla: 10, levelBiznesy: 3, levelFach: 3, rep: 3030 },
  arasaka: { levelDziupla: 10, levelBiznesy: 3, levelFach: 3, rep: 200 },
  militech: { levelDziupla: 10, levelBiznesy: 3, levelFach: 3, rep: 205 },
  kiramann: { levelDziupla: 10, levelBiznesy: 3, levelFach: 3, rep: 220 },
  bar_ostatnia_kropla: { levelDziupla: 10, levelBiznesy: 3, levelFach: 3, rep: 225 },
  chem_barons: { levelDziupla: 10, levelBiznesy: 3, levelFach: 3, rep: 175 },
  izraelici: { levelDziupla: 10, levelBiznesy: 3, levelFach: 3, rep: 210 },
  mojaxdd: { levelDziupla: 4, levelBiznesy: 3, levelFach: 3, rep: 30 },
  auramonsters: { levelDziupla: 8, levelBiznesy: 3, levelFach: 0, rep: 55 },
  taksiczuj: { levelDziupla: 10, levelBiznesy: 2, levelFach: 0, rep: 25 },
  huck2flat: { levelDziupla: 0, levelBiznesy: 2, levelFach: 0, rep: 0 },
  jaraczeganji: { levelDziupla: 5, levelBiznesy: 3, levelFach: 1, rep: 0 },
  nelaispolka: { levelDziupla: 1, levelBiznesy: 3, levelFach: 0, rep: 0 }, // kupione 5.09 w logach czatu
  kotki: { levelDziupla: 3, levelBiznesy: 2, levelFach: 1, rep: 0 },        // kupione 6.09 w logach czatu
  parafia_tuptusiow: { levelDziupla: 10, levelBiznesy: 0, levelFach: 0, rep: 136 }
};

if (!profiles.gangs) profiles.gangs = {};

for (const [gid, u] of Object.entries(GANG_UPGRADES)) {
  if (profiles.gangs[gid]) {
    profiles.gangs[gid].levelDziupla = Math.max(profiles.gangs[gid].levelDziupla || 0, u.levelDziupla);
    profiles.gangs[gid].levelBiznesy = Math.max(profiles.gangs[gid].levelBiznesy || 0, u.levelBiznesy);
    profiles.gangs[gid].levelFach = Math.max(profiles.gangs[gid].levelFach || 0, u.levelFach);
    if (!profiles.gangs[gid].reputation && u.rep) {
      profiles.gangs[gid].reputation = u.rep;
    }
    console.log(`Gang [${profiles.gangs[gid].name}]: Dziupla=${profiles.gangs[gid].levelDziupla}, Biznesy=${profiles.gangs[gid].levelBiznesy}, Fach=${profiles.gangs[gid].levelFach}, Rep=${profiles.gangs[gid].reputation}`);
  }
}

// Przywróć bossShopItems dla gangów jeśli brakuje
if (oldProfiles.gangs) {
  for (const [gid, og] of Object.entries(oldProfiles.gangs)) {
    if (profiles.gangs[gid] && og.bossShopItems && (!profiles.gangs[gid].bossShopItems || profiles.gangs[gid].bossShopItems.length === 0)) {
      profiles.gangs[gid].bossShopItems = [...og.bossShopItems];
      console.log(`Przywrócono bossShopItems dla gangu: ${profiles.gangs[gid].name}`);
    }
  }
}

// ==========================================
// 3. STATYSTYKI GIER, ODZNAKI, LICZNIKI WIADOMOŚCI
// ==========================================
console.log('\n--- 3. Scalanie Statystyk Życiowych Graczy ---');

let statsRestoredUsers = 0;

for (const [id, user] of Object.entries(users)) {
  const old = oldUsers[id];
  if (!old) continue;

  let changed = false;

  // Statystyki gier i wygranych (nie naruszamy nowego stanu konta!)
  if ((!user.totalWon || user.totalWon === 0) && old.totalWon > 0) {
    user.totalWon = old.totalWon;
    changed = true;
  }
  if ((!user.totalLost || user.totalLost === 0) && old.totalLost > 0) {
    user.totalLost = old.totalLost;
    changed = true;
  }
  if ((!user.gamesPlayed || user.gamesPlayed < old.gamesPlayed) && old.gamesPlayed > 0) {
    user.gamesPlayed = Math.max(user.gamesPlayed || 0, old.gamesPlayed);
    changed = true;
  }
  if ((!user.wins || user.wins === 0) && old.wins > 0) {
    user.wins = old.wins;
    changed = true;
  }
  if ((!user.losses || user.losses === 0) && old.losses > 0) {
    user.losses = old.losses;
    changed = true;
  }

  // Liczniki komend i wiadomości
  if ((!user.commandsUsed || user.commandsUsed < old.commandsUsed) && old.commandsUsed > 0) {
    user.commandsUsed = Math.max(user.commandsUsed || 0, old.commandsUsed);
    changed = true;
  }
  if ((!user.messageCount || user.messageCount < old.messageCount) && old.messageCount > 0) {
    user.messageCount = Math.max(user.messageCount || 0, old.messageCount);
    changed = true;
  }

  // Scalenie commandCounts
  if (old.commandCounts) {
    if (!user.commandCounts) user.commandCounts = {};
    for (const [cmd, count] of Object.entries(old.commandCounts)) {
      user.commandCounts[cmd] = Math.max(user.commandCounts[cmd] || 0, count);
    }
    changed = true;
  }

  // Scalenie groupMessages
  if (old.groupMessages) {
    if (!user.groupMessages) user.groupMessages = {};
    for (const [gid, count] of Object.entries(old.groupMessages)) {
      user.groupMessages[gid] = Math.max(user.groupMessages[gid] || 0, count);
    }
    changed = true;
  }

  // Scalenie tipsSent
  if (old.tipsSent) {
    if (!user.tipsSent) user.tipsSent = {};
    for (const [tid, count] of Object.entries(old.tipsSent)) {
      user.tipsSent[tid] = Math.max(user.tipsSent[tid] || 0, count);
    }
    changed = true;
  }

  // Scalenie odznak
  if (old.badges && Array.isArray(old.badges)) {
    if (!user.badges || !Array.isArray(user.badges)) user.badges = [];
    const badgeSet = new Set(user.badges);
    for (const b of old.badges) {
      badgeSet.add(b);
    }
    user.badges = Array.from(badgeSet);
    changed = true;
  }

  // Daily streak
  if (old.dailyStreak && (!user.dailyStreak || user.dailyStreak < old.dailyStreak)) {
    if (old.dailyStreak < 1000) { // odfiltruj błędy testowe
      user.dailyStreak = old.dailyStreak;
      changed = true;
    }
  }

  if (changed) statsRestoredUsers++;
}

console.log(`Zaktualizowano statystyki życiowe dla ${statsRestoredUsers} graczy.`);

// ==========================================
// 4. ZAPIS DO WSZYSTKICH KATALOGÓW BAZY
// ==========================================
console.log('\n--- 4. Zapis do plików bazy danych ---');

const usersTargets = [USERS_PATH, USERS_SEED_PATH, USERS_BACKUP_PATH];
for (const target of usersTargets) {
  if (fs.existsSync(target) || target === USERS_BACKUP_PATH) {
    fs.writeFileSync(target, JSON.stringify(users, null, 2), 'utf8');
    console.log(`Zapisano pomyślnie: ${target}`);
  }
}

const profilesTargets = [PROFILES_PATH, PROFILES_SEED_PATH, PROFILES_BACKUP_PATH];
for (const target of profilesTargets) {
  if (fs.existsSync(target) || target === PROFILES_BACKUP_PATH) {
    fs.writeFileSync(target, JSON.stringify(profiles, null, 2), 'utf8');
    console.log(`Zapisano pomyślnie: ${target}`);
  }
}

console.log('\n=== ZAKOŃCZONO POMYŚLNIE! ===');
