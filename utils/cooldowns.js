const config = require('../config/config');
const { errorEmbed } = require('./embeds');
const { msToReadable } = require('./economy');
const { withData } = require('./storage');

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

async function checkSpam(userId) {
  return withData(store => {
    const now = Date.now();
    const rules = config.antiSpam;
    const entry = normalizeSpamEntry(store.cooldowns.spam[userId]);

    if (entry.blockedUntil > now) {
      store.cooldowns.spam[userId] = entry;
      return {
        blocked: true,
        remaining: entry.blockedUntil - now,
        embed: errorEmbed('Anti-spam', `Zwolnij tempo. Mozesz uzyc komend znow za **${msToReadable(entry.blockedUntil - now)}**.`)
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
        embed: errorEmbed('Anti-spam', `Wykryto spam komend. Blokada potrwa **${rules.muteSeconds}s**.`)
      };
    }

    entry.blockedUntil = 0;
    store.cooldowns.spam[userId] = entry;
    return { blocked: false, remaining: 0 };
  });
}

async function checkCooldown(commandName, userId) {
  return withData(store => {
    const now = Date.now();
    const duration = (config.cooldowns[commandName] || config.cooldowns.default) * 1000;
    const userCooldowns = store.cooldowns.commands[userId] && typeof store.cooldowns.commands[userId] === 'object'
      ? store.cooldowns.commands[userId]
      : {};

    const expiresAt = Number(userCooldowns[commandName] || 0);
    if (expiresAt > now) {
      store.cooldowns.commands[userId] = userCooldowns;
      return {
        active: true,
        remaining: expiresAt - now,
        embed: errorEmbed('Cooldown aktywny', `Odczekaj jeszcze **${msToReadable(expiresAt - now)}** przed ponownym uzyciem tej komendy.`)
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
