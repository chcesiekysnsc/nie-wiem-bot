/**
 * database/repositories/companies.js
 *
 * Repozytorium firm.
 */

const pool = require('../config');

class CompaniesRepository {
  /**
   * Pobierz firmę po id.
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    const res = await pool.query('SELECT * FROM companies WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  /**
   * Pobierz firmy właściciela.
   * @param {number} ownerId
   * @returns {Promise<Object[]>}
   */
  async getByOwnerId(ownerId) {
    const res = await pool.query(
      'SELECT * FROM companies WHERE owner_id = $1 ORDER BY name',
      [ownerId]
    );
    return res.rows;
  }

  /**
   * Pobierz wszystkie firmy.
   * @returns {Promise<Object[]>}
   */
  async getAll() {
    const res = await pool.query('SELECT * FROM companies ORDER BY name');
    return res.rows;
  }

  /**
   * Utwórz firmę.
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async create(data) {
    const res = await pool.query(
      `INSERT INTO companies (owner_id, name, type, level, income)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.ownerId,
        String(data.name),
        String(data.type),
        Math.max(1, Math.floor(Number(data.level) || 1)),
        JSON.stringify(data.income || {})
      ]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj level firmy.
   * @param {number} companyId
   * @param {number} level
   * @returns {Promise<Object>}
   */
  async setLevel(companyId, level) {
    const res = await pool.query(
      'UPDATE companies SET level = $1 WHERE id = $2 RETURNING *',
      [Math.max(1, Math.floor(level)), companyId]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj dochód firmy.
   * @param {number} companyId
   * @param {Object} income
   * @returns {Promise<Object>}
   */
  async setIncome(companyId, income) {
    const res = await pool.query(
      'UPDATE companies SET income = $1 WHERE id = $2 RETURNING *',
      [JSON.stringify(income || {}), companyId]
    );
    return res.rows[0];
  }

  /**
   * Ustaw czas ostatniej wypłaty.
   * @param {number} companyId
   * @param {Date} time
   * @returns {Promise<Object>}
   */
  async setLastClaim(companyId, time) {
    const res = await pool.query(
      'UPDATE companies SET last_claim = $1 WHERE id = $2 RETURNING *',
      [time instanceof Date ? time : new Date(time), companyId]
    );
    return res.rows[0];
  }

  /**
   * Dodaj pracownika do firmy.
   * @param {number} companyId
   * @param {number} userId
   * @param {string} role
   * @returns {Promise<void>}
   */
  async addEmployee(companyId, userId, role = 'worker') {
    await pool.query(
      `INSERT INTO company_employees (company_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [companyId, userId, String(role)]
    );
  }

  /**
   * Usuń pracownika z firmy.
   * @param {number} companyId
   * @param {number} userId
   * @returns {Promise<void>}
   */
  async removeEmployee(companyId, userId) {
    await pool.query(
      'DELETE FROM company_employees WHERE company_id = $1 AND user_id = $2',
      [companyId, userId]
    );
  }

  /**
   * Pobierz pracowników firmy.
   * @param {number} companyId
   * @returns {Promise<Object[]>}
   */
  async getEmployees(companyId) {
    const res = await pool.query(
      `SELECT u.*, ce.role, ce.joined_at
       FROM company_employees ce
       JOIN users u ON u.id = ce.user_id
       WHERE ce.company_id = $1
       ORDER BY ce.joined_at ASC`,
      [companyId]
    );
    return res.rows;
  }

  /**
   * Pobierz firmy użytkownika (jako pracownika).
   * @param {number} userId
   * @returns {Promise<Object[]>}
   */
  async getEmployers(userId) {
    const res = await pool.query(
      `SELECT c.*, ce.role
       FROM company_employees ce
       JOIN companies c ON c.id = ce.company_id
       WHERE ce.user_id = $1
       ORDER BY c.name`,
      [userId]
    );
    return res.rows;
  }

  /**
   * Usuń firmę.
   * @param {number} companyId
   * @returns {Promise<void>}
   */
  async delete(companyId) {
    await pool.query('DELETE FROM companies WHERE id = $1', [companyId]);
  }
}

module.exports = new CompaniesRepository();
