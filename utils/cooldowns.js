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
        `Zostałeś dodany do czarnej listy za spamowanie komendami na cooldownie. W ciągu **${rules.perSeconds}s** otrzymałeś **${rules.maxNotifications}** powiadomień o aktywnym cooldownie.`
      )
    };
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
    let duration = (config.cooldowns[commandName] || config.cooldowns.default) * 1000;
    
    // Stary Zegar cooldown reduction
    if (commandName === 'crime' || commandName === 'work') {
      const inventory = store.inventory[userId];
      if (inventory && (inventory['stary_zegar'] || 0) > 0) {
        duration = Math.floor(duration * 0.90);
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

    userCooldowns[commandName] = now + duration;
    store.cooldowns.commands[userId] = userCooldowns;
    return { active: false, remaining: 0 };
  });
}

module.exports = {
  checkSpam,
  checkCooldown
};
