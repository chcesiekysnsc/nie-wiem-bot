/**
 * database/repositories/transactions.js
 *
 * Repozytorium transakcji (historia ekonomiczna).
 */

const pool = require('../config');

class TransactionsRepository {
  /**
   * Pobierz historię transakcji użytkownika.
   * @param {number} userId
   * @param {number} limit
   * @param {number} offset
   * @returns {Promise<Object[]>}
   */
  async getByUserId(userId, limit = 50, offset = 0) {
    const res = await pool.query(
      'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    return res.rows;
  }

  /**
   * Pobierz transakcje według typu.
   * @param {string} type
   * @param {number} limit
   * @param {number} offset
   * @returns {Promise<Object[]>}
   */
  async getByType(type, limit = 50, offset = 0) {
    const res = await pool.query(
      'SELECT * FROM transactions WHERE type = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [String(type), limit, offset]
    );
    return res.rows;
  }

  /**
   * Pobierz transakcje użytkownika według typu.
   * @param {number} userId
   * @param {string} type
   * @param {number} limit
   * @param {number} offset
   * @returns {Promise<Object[]>}
   */
  async getByUserIdAndType(userId, type, limit = 50, offset = 0) {
    const res = await pool.query(
      'SELECT * FROM transactions WHERE user_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4',
      [userId, String(type), limit, offset]
    );
    return res.rows;
  }

  /**
   * Dodaj transakcję.
   * @param {number} userId
   * @param {number} amount
   * @param {string} type
   * @param {string} reason
   * @param {number} balanceAfter
   * @param {Object} metadata
   * @returns {Promise<Object>}
   */
  async create(userId, amount, type, reason, balanceAfter, metadata = {}) {
    const res = await pool.query(
      `INSERT INTO transactions (user_id, amount, type, reason, balance_after, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        userId,
        amount,
        String(type),
        String(reason || ''),
        balanceAfter,
        JSON.stringify(metadata || {})
      ]
    );
    return res.rows[0];
  }

  /**
   * Oblicz sumę transakcji użytkownika.
   * @param {number} userId
   * @param {string} type
   * @returns {Promise<number>}
   */
  async getTotalAmount(userId, type = null) {
    let query = 'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = $1';
    const params = [userId];
    if (type) {
      query += ' AND type = $2';
      params.push(type);
    }
    const res = await pool.query(query, params);
    return Number(res.rows[0]?.total || 0);
  }

  /**
   * Usuń stare transakcje.
   * @param {number} olderThanDays
   * @returns {Promise<number>} liczba usuniętych
   */
  async deleteOlderThan(olderThanDays = 90) {
    const res = await pool.query(
      `DELETE FROM transactions
       WHERE created_at < NOW() - INTERVAL '${olderThanDays} days'
       RETURNING id`
    );
    return res.rowCount || 0;
  }
}

module.exports = new TransactionsRepository();
