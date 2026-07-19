/**
 * database/repositories/events.js
 *
 * Repozytorium eventów gry.
 */

const pool = require('../config');

class EventsRepository {
  /**
   * Pobierz wszystkie aktywne eventy.
   * @returns {Promise<Object[]>}
   */
  async getActive() {
    const now = new Date();
    const res = await pool.query(
      `SELECT * FROM game_events
       WHERE active = true AND starts_at <= $1 AND (ends_at IS NULL OR ends_at > $1)
       ORDER BY starts_at DESC`,
      [now]
    );
    return res.rows;
  }

  /**
   * Pobierz event po id.
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    const res = await pool.query('SELECT * FROM game_events WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  /**
   * Pobierz wszystkie eventy.
   * @param {boolean} includeInactive
   * @returns {Promise<Object[]>}
   */
  async getAll(includeInactive = false) {
    const res = await pool.query(
      'SELECT * FROM game_events ORDER BY starts_at DESC'
    );
    return res.rows;
  }

  /**
   * Utwórz event.
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async create(data) {
    const res = await pool.query(
      `INSERT INTO game_events (
        name, type, multiplier, cooldown_reduction, discount_percent,
        reward_multiplier, requirements, starts_at, ends_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      )
      RETURNING *`,
      [
        String(data.name || 'Event'),
        String(data.type || 'general'),
        Number(data.multiplier) || 1,
        Number(data.cooldownReduction || data.reductionPercent || 0),
        Number(data.discountPercent || 0),
        Number(data.rewardMultiplier || 1),
        JSON.stringify(data.requirements || {}),
        data.startsAt ? new Date(data.startsAt) : new Date(),
        data.endsAt ? new Date(data.endsAt) : null,
        data.active !== false
      ]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj event.
   * @param {number} id
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async update(id, data) {
    const res = await pool.query(
      `UPDATE game_events
       SET name = COALESCE($2, name),
           type = COALESCE($3, type),
           multiplier = COALESCE($4, multiplier),
           cooldown_reduction = COALESCE($5, cooldown_reduction),
           discount_percent = COALESCE($6, discount_percent),
           reward_multiplier = COALESCE($7, reward_multiplier),
           requirements = COALESCE($8, requirements),
           ends_at = COALESCE($9, ends_at),
           active = COALESCE($10, active)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        data.name ? String(data.name) : null,
        data.type ? String(data.type) : null,
        data.multiplier !== undefined ? Number(data.multiplier) : null,
        data.cooldownReduction !== undefined ? Number(data.cooldownReduction) : null,
        data.discountPercent !== undefined ? Number(data.discountPercent) : null,
        data.rewardMultiplier !== undefined ? Number(data.rewardMultiplier) : null,
        data.requirements ? JSON.stringify(data.requirements) : null,
        data.endsAt ? new Date(data.endsAt) : null,
        data.active !== undefined ? data.active : null
      ]
    );
    return res.rows[0];
  }

  /**
   * Dezaktywuj event.
   * @param {number} id
   * @returns {Promise<Object>}
   */
  async deactivate(id) {
    const res = await pool.query(
      'UPDATE game_events SET active = false WHERE id = $1 RETURNING *',
      [id]
    );
    return res.rows[0];
  }

  /**
   * Usuń event.
   * @param {number} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    await pool.query('DELETE FROM game_events WHERE id = $1', [id]);
  }

  /**
   * Pobierz mnożnik eventu dla danego typu.
   * @param {string} type
   * @returns {Promise<number>}
   */
  async getMultiplier(type) {
    const now = new Date();
    const res = await pool.query(
      `SELECT multiplier FROM game_events
       WHERE type = $1 AND active = true AND starts_at <= $2 AND (ends_at IS NULL OR ends_at > $2)
       ORDER BY multiplier DESC LIMIT 1`,
      [String(type), now]
    );
    return Number(res.rows[0]?.multiplier || 1);
  }

  /**
   * Pobierz redukcję cooldownu.
   * @param {string} type
   * @returns {Promise<number>}
   */
  async getCooldownReduction(type) {
    const now = new Date();
    const res = await pool.query(
      `SELECT cooldown_reduction FROM game_events
       WHERE type = $1 AND active = true AND starts_at <= $2 AND (ends_at IS NULL OR ends_at > $2)
       ORDER BY cooldown_reduction DESC LIMIT 1`,
      [String(type), now]
    );
    return Number(res.rows[0]?.cooldown_reduction || 0);
  }

  /**
   * Pobierz zniżkę w sklepie.
   * @returns {Promise<number>}
   */
  async getShopDiscount() {
    const now = new Date();
    const res = await pool.query(
      `SELECT discount_percent FROM game_events
       WHERE type = 'shop_discount' AND active = true AND starts_at <= $1 AND (ends_at IS NULL OR ends_at > $1)
       ORDER BY discount_percent DESC LIMIT 1`,
      [now]
    );
    return Number(res.rows[0]?.discount_percent || 0);
  }
}

module.exports = new EventsRepository();
