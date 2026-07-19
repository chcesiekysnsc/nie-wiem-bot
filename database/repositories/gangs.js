/**
 * database/repositories/gangs.js
 *
 * Repozytorium gangów.
 */

const pool = require('../config');

class GangsRepository {
  /**
   * Pobierz gang po nazwie.
   * @param {string} name
   * @returns {Promise<Object|null>}
   */
  async getByName(name) {
    const res = await pool.query('SELECT * FROM gangs WHERE name = $1', [String(name)]);
    return res.rows[0] || null;
  }

  /**
   * Pobierz gang po id.
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    const res = await pool.query('SELECT * FROM gangs WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  /**
   * Pobierz gang po boss_id.
   * @param {number} bossId
   * @returns {Promise<Object|null>}
   */
  async getByBossId(bossId) {
    const res = await pool.query('SELECT * FROM gangs WHERE boss_id = $1', [bossId]);
    return res.rows[0] || null;
  }

  /**
   * Pobierz wszystkie gangi.
   * @returns {Promise<Object[]>}
   */
  async getAll() {
    const res = await pool.query('SELECT * FROM gangs ORDER BY name');
    return res.rows;
  }

  /**
   * Utwórz gang.
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async create(data) {
    const res = await pool.query(
      `INSERT INTO gangs (name, boss_id, vault, level_dziupla, level_biznesy, level_fach, reputation)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        String(data.name),
        data.bossId || null,
        Math.max(0, Number(data.vault) || 0),
        Math.max(0, Math.floor(Number(data.levelDziupla) || 0)),
        Math.max(0, Math.floor(Number(data.levelBiznesy) || 0)),
        Math.max(0, Math.floor(Number(data.levelFach) || 0)),
        Math.max(0, Math.floor(Number(data.reputation) || 0))
      ]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj skarbiec gangu.
   * @param {number} gangId
   * @param {number} amount
   * @returns {Promise<Object>}
   */
  async updateVault(gangId, amount) {
    const res = await pool.query(
      'UPDATE gangs SET vault = vault + $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [amount, gangId]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj poziom ulepszenia.
   * @param {number} gangId
   * @param {string} upgradeType
   * @param {number} level
   * @returns {Promise<Object>}
   */
  async setUpgradeLevel(gangId, upgradeType, level) {
    await pool.query(
      `INSERT INTO gang_upgrades (gang_id, upgrade_type, level)
       VALUES ($1, $2, $3)
       ON CONFLICT (gang_id, upgrade_type) DO UPDATE SET level = EXCLUDED.level`,
      [gangId, String(upgradeType), Math.max(0, Math.floor(level))]
    );
    const res = await pool.query('SELECT * FROM gangs WHERE id = $1', [gangId]);
    return res.rows[0];
  }

  /**
   * Dodaj członka do gangu.
   * @param {number} gangId
   * @param {number} userId
   * @param {string} role
   * @returns {Promise<void>}
   */
  async addMember(gangId, userId, role = 'member') {
    await pool.query(
      `INSERT INTO gang_members (gang_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (gang_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [gangId, userId, String(role)]
    );
  }

  /**
   * Usuń członka z gangu.
   * @param {number} gangId
   * @param {number} userId
   * @returns {Promise<void>}
   */
  async removeMember(gangId, userId) {
    await pool.query('DELETE FROM gang_members WHERE gang_id = $1 AND user_id = $2', [gangId, userId]);
  }

  /**
   * Pobierz członków gangu.
   * @param {number} gangId
   * @returns {Promise<Object[]>}
   */
  async getMembers(gangId) {
    const res = await pool.query(
      `SELECT u.*, gm.role, gm.joined_at
       FROM gang_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.gang_id = $1
       ORDER BY gm.joined_at ASC`,
      [gangId]
    );
    return res.rows;
  }

  /**
   * Pobierz liczbę członków gangu.
   * @param {number} gangId
   * @returns {Promise<number>}
   */
  async getMemberCount(gangId) {
    const res = await pool.query(
      'SELECT COUNT(*) as count FROM gang_members WHERE gang_id = $1',
      [gangId]
    );
    return parseInt(res.rows[0]?.count || '0', 10);
  }

  /**
   * Sprawdź czy użytkownik jest w gangu.
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  async getGangByMember(userId) {
    const res = await pool.query(
      `SELECT g.* FROM gangs g
       JOIN gang_members gm ON gm.gang_id = g.id
       WHERE gm.user_id = $1
       LIMIT 1`,
      [userId]
    );
    return res.rows[0] || null;
  }

  /**
   * Pobierz depozyt użytkownika w gangu.
   * @param {number} gangId
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  async getDeposit(gangId, userId) {
    const res = await pool.query(
      'SELECT * FROM gang_deposits WHERE gang_id = $1 AND user_id = $2',
      [gangId, userId]
    );
    return res.rows[0] || null;
  }

  /**
   * Zaktualizuj depozyt w gangu.
   * @param {number} gangId
   * @param {number} userId
   * @param {number} amount
   * @returns {Promise<Object>}
   */
  async updateDeposit(gangId, userId, amount) {
    const res = await pool.query(
      `INSERT INTO gang_deposits (gang_id, user_id, amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (gang_id, user_id) DO UPDATE SET
         amount = EXCLUDED.amount,
         updated_at = NOW()
       RETURNING *`,
      [gangId, userId, Math.max(0, amount)]
    );
    return res.rows[0];
  }

  /**
   * Pobierz sojuszy gangu.
   * @param {number} gangId
   * @returns {Promise<Object[]>}
   */
  async getAlliances(gangId) {
    const res = await pool.query(
      `SELECT g.* FROM gang_alliances ga
       JOIN gangs g ON g.id = ga.ally_gang_id
       WHERE ga.gang_id = $1`,
      [gangId]
    );
    return res.rows;
  }

  /**
   * Dodaj sojusz.
   * @param {number} gangId
   * @param {number} allyGangId
   * @returns {Promise<void>}
   */
  async addAlliance(gangId, allyGangId) {
    await pool.query(
      `INSERT INTO gang_alliances (gang_id, ally_gang_id)
       VALUES ($1, $2)
       ON CONFLICT (gang_id, ally_gang_id) DO NOTHING`,
      [gangId, allyGangId]
    );
  }

  /**
   * Usuń sojusz.
   * @param {number} gangId
   * @param {number} allyGangId
   * @returns {Promise<void>}
   */
  async removeAlliance(gangId, allyGangId) {
    await pool.query(
      'DELETE FROM gang_alliances WHERE gang_id = $1 AND ally_gang_id = $2',
      [gangId, allyGangId]
    );
  }

  /**
   * Zaktualizuj czas ostatniego ataku.
   * @param {number} gangId
   * @param {Date} time
   * @returns {Promise<Object>}
   */
  async setLastAttackTime(gangId, time) {
    const res = await pool.query(
      'UPDATE gangs SET last_attack_time = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [time instanceof Date ? time : new Date(time), gangId]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj tarczę.
   * @param {number} gangId
   * @param {Date|null} shieldUntil
   * @returns {Promise<Object>}
   */
  async setShieldUntil(gangId, shieldUntil) {
    const res = await pool.query(
      'UPDATE gangs SET shield_until = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [shieldUntil, gangId]
    );
    return res.rows[0];
  }
}

module.exports = new GangsRepository();
