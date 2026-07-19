/**
 * database/repositories/cooldowns.js
 *
 * Repozytorium cooldownów i spamu.
 */

const pool = require('../config');

class CooldownsRepository {
  /**
   * Pobierz cooldown użytkownika.
   * @param {number} userId
   * @param {string} commandName
   * @returns {Promise<Object|null>}
   */
  async getCooldown(userId, commandName) {
    const res = await pool.query(
      'SELECT * FROM command_cooldowns WHERE user_id = $1 AND command_name = $2',
      [userId, String(commandName)]
    );
    return res.rows[0] || null;
  }

  /**
   * Pobierz wszystkie cooldowny użytkownika.
   * @param {number} userId
   * @returns {Promise<Object>} { commandName: expiresAt }
   */
  async getAllCooldowns(userId) {
    const res = await pool.query(
      'SELECT command_name, expires_at FROM command_cooldowns WHERE user_id = $1',
      [userId]
    );
    const cooldowns = {};
    for (const row of res.rows) {
      cooldowns[row.command_name] = row.expires_at;
    }
    return cooldowns;
  }

  /**
   * Ustaw cooldown.
   * @param {number} userId
   * @param {string} commandName
   * @param {Date} expiresAt
   * @returns {Promise<void>}
   */
  async setCooldown(userId, commandName, expiresAt) {
    await pool.query(
      `INSERT INTO command_cooldowns (user_id, command_name, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, command_name) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
      [userId, String(commandName), expiresAt instanceof Date ? expiresAt : new Date(expiresAt)]
    );
  }

  /**
   * Usuń cooldown.
   * @param {number} userId
   * @param {string} commandName
   * @returns {Promise<void>}
   */
  async removeCooldown(userId, commandName) {
    await pool.query(
      'DELETE FROM command_cooldowns WHERE user_id = $1 AND command_name = $2',
      [userId, String(commandName)]
    );
  }

  /**
   * Usuń wszystkie cooldowny użytkownika.
   * @param {number} userId
   * @returns {Promise<void>}
   */
  async clearAllCooldowns(userId) {
    await pool.query('DELETE FROM command_cooldowns WHERE user_id = $1', [userId]);
  }

  /**
   * Usuń wygasłe cooldowny.
   * @returns {Promise<number>} liczba usuniętych
   */
  async clearExpiredCooldowns() {
    const res = await pool.query(
      'DELETE FROM command_cooldowns WHERE expires_at < NOW() RETURNING *'
    );
    return res.rowCount || 0;
  }

  /**
   * Pobierz wpis spam użytkownika.
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  async getSpamEntry(userId) {
    const res = await pool.query(
      'SELECT * FROM spam_entries WHERE user_id = $1',
      [userId]
    );
    return res.rows[0] || null;
  }

  /**
   * Zaktualizuj wpis spam użytkownika.
   * @param {number} userId
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async updateSpamEntry(userId, data) {
    const entry = await this.getSpamEntry(userId);
    if (!entry) {
      const res = await pool.query(
        `INSERT INTO spam_entries (user_id, timestamps, blocked_until, warning_count, blacklisted)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          userId,
          data.timestamps || [],
          data.blocked_until || null,
          Math.max(0, Number(data.warning_count) || 0),
          Boolean(data.blacklisted)
        ]
      );
      return res.rows[0];
    }

    const res = await pool.query(
      `UPDATE spam_entries
       SET timestamps = COALESCE($2, timestamps),
           blocked_until = COALESCE($3, blocked_until),
           warning_count = $4,
           blacklisted = COALESCE($5, blacklisted),
           updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [
        userId,
        data.timestamps || entry.timestamps,
        data.blocked_until !== undefined ? data.blocked_until : entry.blocked_until,
        Math.max(0, Number(data.warning_count ?? entry.warning_count) || 0),
        data.blacklisted !== undefined ? data.blacklisted : entry.blacklisted
      ]
    );
    return res.rows[0];
  }

  /**
   * Dodaj timestamp do wpisu spam.
   * @param {number} userId
   * @param {Date} timestamp
   * @returns {Promise<Object>}
   */
  async addSpamTimestamp(userId, timestamp) {
    const entry = await this.getSpamEntry(userId);
    const timestamps = entry?.timestamps || [];
    timestamps.push(timestamp instanceof Date ? timestamp : new Date(timestamp));

    // Usuń stare timestampy (starsze niż 1 godzina)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const filtered = timestamps.filter(t => t > oneHourAgo);

    return this.updateSpamEntry(userId, { timestamps: filtered });
  }

  /**
   * Zablokuj użytkownika na czas.
   * @param {number} userId
   * @param {Date} until
   * @returns {Promise<Object>}
   */
  async blockUser(userId, until) {
    return this.updateSpamEntry(userId, {
      blocked_until: until instanceof Date ? until : new Date(until),
      timestamps: []
    });
  }

  /**
   * Zbanuj użytkownika permanentnie.
   * @param {number} userId
   * @returns {Promise<Object>}
   */
  async banUser(userId) {
    return this.updateSpamEntry(userId, { blacklisted: true, blocked_until: null });
  }

  /**
   * Pobierz wszystkich zbanowanych użytkowników.
   * @returns {Promise<Object[]>}
   */
  async getBlacklistedUsers() {
    const res = await pool.query(
      'SELECT * FROM spam_entries WHERE blacklisted = true'
    );
    return res.rows;
  }

  /**
   * Pobierz powiadomienia cooldown użytkownika.
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  async getCooldownNotification(userId) {
    const res = await pool.query(
      'SELECT * FROM spam_entries WHERE user_id = $1',
      [userId]
    );
    return res.rows[0] || null;
  }
}

module.exports = new CooldownsRepository();
