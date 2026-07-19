/**
 * database/repositories/index.js
 *
 * Eksport wszystkich repozytoriów.
 */

module.exports = {
  users: require('./users'),
  items: require('./items'),
  gangs: require('./gangs'),
  companies: require('./companies'),
  cooldowns: require('./cooldowns'),
  events: require('./events'),
  transactions: require('./transactions')
};
