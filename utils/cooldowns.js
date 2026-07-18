const config = require('../config/config');
const { errorEmbed } = require('./embeds');
const { msToReadable } = require('./economy');
const { withData } = require('./storage');

const BYPASS_IDS = ['61571684725864', '100060812419294'];

function normalizeSpamEntry(entry) {
  const safeEntry = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
  const timestamps = Array.isArray(safeEntry.timestamps)
    ? safeEntry.timestamps.filter(value => Number.isFinite(value))
    : [];

  return {
    timestamps,
    blockedUntil: Number.isFinite(safeEntry.blockedUntil) ? safeEntry.blockedUntil : 0
  };
}

function normalizeCooldownNotificationEntry(entry) {
  const safeEntry = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
  const timestamps = Array.isArray(safeEntry.timestamps)
    ? safeEntry.timestamps.filter(value => Number.isFinite(value))
    : [];

  return { timestamps };
}

function getCooldownBlacklistRules() {
  const rules = config.antiSpam && typeof config.antiSpam === 'object' ? config.antiSpam.cooldownBlacklist : null;

  return {
    maxNotifications: Math.max(1, Math.floor(Number(rules && rules.maxNotifications) || 5)),
    perSeconds: Math.max(1, Math.floor(Number(rules && rules.perSeconds) || 30))
  };
}

function registerCooldownNotification(store, userId, now) {
  const rules = getCooldownBlacklistRules();
  const windowMs = rules.perSeconds * 1000;
  const entry = normalizeCooldownNotificationEntry(store.cooldowns.cooldownNotifications[userId]);

  entry.timestamps = entry.timestamps.filter(timestamp => now - timestamp <= windowMs);
  entry.timestamps.push(now);

  if (entry.timestamps.length >= rules.maxNotifications) {
    delete store.cooldowns.cooldownNotifications[userId];

    // Sprawdź ile razy gracz już dostawał ostrzeżenie za spam
    if (!store.profiles.spamWarnings) store.profiles.spamWarnings = {};
    const previousWarnings = store.profiles.spamWarnings[userId] || 0;

    if (previousWarnings === 0) {
      // Pierwsze złapanie — tymczasowy ban na 30 minut + ostrzeżenie
      store.profiles.spamWarnings[userId] = 1;

      // Ustaw tymczasowy spam block na 30 minut
      if (!store.cooldowns.spam[userId] || typeof store.cooldowns.spam[userId] !== 'object') {
        store.cooldowns.spam[userId] = { timestamps: [], blockedUntil: 0 };
      }
      store.cooldowns.spam[userId].blockedUntil = now + (30 * 60 * 1000);
      store.cooldowns.spam[userId].timestamps = [];

      return {
        blacklisted: false,
        tempBanned: true,
        embed: errorEmbed(
          '⚠️ Ostrzeżenie — tymczasowa blokada',
          `Wykryto spamowanie komendami na cooldownie (**${rules.maxNotifications}** razy w ciągu **${rules.perSeconds}s**).\n\n` +
          `🔒 Otrzymujesz **tymczasową blokadę na 30 minut**.\n` +
          `⚠️ **Kolejne złapanie na spamie spowoduje TRWAŁE dodanie do czarnej listy!**`
        )
      };
    } else {
      // Drugie (i kolejne) złapanie — trwała czarna lista
      store.profiles.spamWarnings[userId] = previousWarnings + 1;

      if (!store.profiles.blacklist) {
        store.profiles.blacklist = [];
      }

      if (!store.profiles.blacklist.includes(userId)) {
        store.profiles.blacklist.push(userId);
      }

      return {
        blacklisted: true,
        embed: errorEmbed(
          '🚫 Czarna lista',
          `Zostałeś dodany do czarnej listy za ponowne spamowanie komendami na cooldownie. W ciągu **${rules.perSeconds}s** otrzymałeś **${rules.maxNotifications}** powiadomień o aktywnym cooldownie.\n\n` +
          `To Twoje **${previousWarnings + 1}.** wykroczenie. Blokada jest trwała.`
        )
      };
    }
  }

  store.cooldowns.cooldownNotifications[userId] = entry;
  return { blacklisted: false };
}

async function checkSpam(userId) {
  if (BYPASS_IDS.includes(userId)) {
    return { blocked: false, remaining: 0 };
  }
  return withData(store => {
    const now = Date.now();
    const rules = config.antiSpam;
    const entry = normalizeSpamEntry(store.cooldowns.spam[userId]);

    if (entry.blockedUntil > now) {
      store.cooldowns.spam[userId] = entry;
      return {
        blocked: true,
        remaining: entry.blockedUntil - now,
        embed: errorEmbed('⏱️ Zbyt szybko!', `Zaczekaj jeszcze **${msToReadable(entry.blockedUntil - now)}**.`)
      };
    }

    entry.timestamps = entry.timestamps.filter(timestamp => now - timestamp <= rules.perSeconds * 1000);
    entry.timestamps.push(now);

    if (entry.timestamps.length > rules.maxCommands) {
      entry.timestamps = [];
      entry.blockedUntil = now + rules.muteSeconds * 1000;
      store.cooldowns.spam[userId] = entry;

      return {
        blocked: true,
        remaining: rules.muteSeconds * 1000,
        embed: errorEmbed('⏱️ Zbyt szybko!', `Zaczekaj **${rules.muteSeconds}s**.`)
      };
    }

    entry.blockedUntil = 0;
    store.cooldowns.spam[userId] = entry;
    return { blocked: false, remaining: 0 };
  });
}

async function checkCooldown(commandName, userId) {
  if (BYPASS_IDS.includes(userId)) {
    return { active: false, remaining: 0 };
  }
  return withData(store => {
    const now = Date.now();
    const rawDuration = config.cooldowns[commandName];
    let duration = (rawDuration !== undefined ? rawDuration : config.cooldowns.default) * 1000;
    
    // Stary Zegar cooldown reduction
    if (commandName === 'crime' || commandName === 'work') {
      const inventory = store.inventory[userId];
      if (inventory && (inventory['stary_zegar'] || 0) > 0) {
        duration = Math.floor(duration * 0.90);
      }
    }

    // Szwajcarski Zegarek cooldown reduction
    if (['crime', 'work', 'rob'].includes(commandName)) {
      const inventory = store.inventory[userId];
      if (inventory && (inventory['szwajcarski_zegarek'] || 0) > 0) {
        duration = Math.floor(duration * 0.85);
      }
    }

    // Klikacz / Wladca Bota cooldown reduction
    const user = store.users[userId];
    if (user && user.badges) {
      if (user.badges.includes(config.badges.klikacz)) {
        duration = Math.floor(duration * 0.97);
      }
      if (user.badges.includes(config.badges.wladcaBota)) {
        duration = Math.floor(duration * 0.95);
      }
    }

    const userCooldowns = store.cooldowns.commands[userId] && typeof store.cooldowns.commands[userId] === 'object'
      ? store.cooldowns.commands[userId]
      : {};

    const expiresAt = Number(userCooldowns[commandName] || 0);
    if (expiresAt > now) {
      const cooldownNotificationState = registerCooldownNotification(store, userId, now);
      store.cooldowns.commands[userId] = userCooldowns;

      if (cooldownNotificationState.blacklisted) {
        return {
          active: true,
          remaining: expiresAt - now,
          blacklisted: true,
          embed: cooldownNotificationState.embed
        };
      }

      return {
        active: true,
        remaining: expiresAt - now,
        embed: errorEmbed('⏱️ Cooldown', `Zaczekaj jeszcze **${msToReadable(expiresAt - now)}**.`)
      };
    }

    // Eventy: jeżeli istnieje event "cooldowns" to skracamy cooldowny.
    // Panel tworzy eventy w minutach -> endTime w ms działa jak reszta.
    // Zakładamy mnożnik > 1 oznacza szybsze cooldowny (np. x2 => cooldown * 0.5).
    try {
      const { getActiveEventMultiplier } = require('./economy');
      const evMul = typeof getActiveEventMultiplier === 'function' ? getActiveEventMultiplier('cooldowns') : 1;
      if (evMul && evMul > 1) {
        duration = Math.floor(duration / evMul);
      }
    } catch (_) {}

    userCooldowns[commandName] = now + duration;
    store.cooldowns.commands[userId] = userCooldowns;
    return { active: false, remaining: 0 };
  });
}

async function checkAdminDailyLimit(commandName, userId) {
  const limits = config.adminDailyLimits;
  if (!limits || !limits.unlimited || !limits.daily) {
    return { allowed: true };
  }

  const isUnlimited = limits.unlimited.includes(commandName);
  const dailyLimit = limits.daily[commandName];
  const isAdmin = config.admins.includes(userId) || userId === '100060812419294';

  if (!isUnlimited && !dailyLimit) {
    return { allowed: true };
  }

  if (isUnlimited && isAdmin) {
    return { allowed: true };
  }

  if (dailyLimit && isAdmin) {
    return withData(store => {
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      store.cooldowns.adminDailyUsage = store.cooldowns.adminDailyUsage || {};
      store.cooldowns.adminDailyUsage[userId] = store.cooldowns.adminDailyUsage[userId] || {};
      const userUsages = store.cooldowns.adminDailyUsage[userId][commandName] || [];
      const recentUsages = userUsages.filter(ts => now - ts < oneDayMs);

      if (recentUsages.length >= dailyLimit) {
        const oldestUsage = recentUsages[0];
        const remaining = oneDayMs - (now - oldestUsage);
        return {
          allowed: false,
          remaining,
          embed: errorEmbed(
            '⏱️ Dzienny limit',
            `Przekroczyłeś dzienny limit użyć tej komendy (${dailyLimit}/dzień). Kolejne użycie będzie dostępne za **${msToReadable(remaining)}**.`
          )
        };
      }

      recentUsages.push(now);
      store.cooldowns.adminDailyUsage[userId][commandName] = recentUsages;
      return { allowed: true };
    });
  }

  return { allowed: true };
}

module.exports = {
  checkSpam,
  checkCooldown,
  checkAdminDailyLimit
};
