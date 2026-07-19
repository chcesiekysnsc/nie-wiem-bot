/**
 * database/repositories/users.js
 *
 * Repozytorium użytkowników.
 */

const pool = require('../config');

class UsersRepository {
  /**
   * Pobierz użytkownika po messenger_id.
   * @param {string} messengerId
   * @returns {Promise<Object|null>}
   */
  async getByMessengerId(messengerId) {
    const res = await pool.query('SELECT * FROM users WHERE messenger_id = $1', [String(messengerId)]);
    return res.rows[0] || null;
  }

  /**
   * Pobierz użytkownika po id.
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  /**
   * Pobierz użytkowników po messenger_ids.
   * @param {string[]} messengerIds
   * @returns {Promise<Object[]>}
   */
  async getByMessengerIds(messengerIds) {
    const res = await pool.query(
      'SELECT * FROM users WHERE messenger_id = ANY($1::text[])',
      [messengerIds.map(String)]
    );
    return res.rows;
  }

  /**
   * Utwórz nowego użytkownika.
   * @param {string} messengerId
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async create(messengerId, data = {}) {
    const res = await pool.query(
      `INSERT INTO users (
        messenger_id, name, balance, bank, level, xp, prestige,
        badges, last_active_thread_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      )
      RETURNING *`,
      [
        String(messengerId),
        data.name || null,
        Math.max(0, Number(data.balance) || 0),
        Math.max(0, Number(data.bank) || 0),
        Math.max(1, Math.floor(Number(data.level) || 1)),
        Math.max(0, Math.floor(Number(data.xp) || 0)),
        Math.max(0, Math.floor(Number(data.prestige) || 0)),
        Array.isArray(data.badges) ? data.badges : [],
        data.lastActiveThreadId || null
      ]
    );
    return res.rows[0];
  }

  /**
   * Utwórz lub pobierz użytkownika (getOrCreate).
   * @param {string} messengerId
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async getOrCreate(messengerId, data = {}) {
    let user = await this.getByMessengerId(messengerId);
    if (!user) {
      user = await this.create(messengerId, data);
    }
    return user;
  }

  /**
   * Zaktualizuj saldo użytkownika.
   * @param {number} userId
   * @param {number} amount
   * @param {string} reason
   * @returns {Promise<Object>}
   */
  async updateBalance(userId, amount, reason = null) {
    const res = await pool.query(
      'UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [amount, userId]
    );
    const user = res.rows[0];
    if (user && reason) {
      await this.logTransaction(userId, amount, 'balance_update', reason, user.balance - amount);
    }
    return user;
  }

  /**
   * Zaktualizuj bank użytkownika.
   * @param {number} userId
   * @param {number} amount
   * @param {string} reason
   * @returns {Promise<Object>}
   */
  async updateBank(userId, amount, reason = null) {
    const res = await pool.query(
      'UPDATE users SET bank = bank + $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [amount, userId]
    );
    const user = res.rows[0];
    if (user && reason) {
      await this.logTransaction(userId, amount, 'bank_update', reason, user.bank - amount);
    }
    return user;
  }

  /**
   * Dodaj XP użytkownikowi.
   * @param {number} userId
   * @param {number} amount
   * @param {string} reason
   * @returns {Promise<Object>}
   */
  async addXp(userId, amount, reason = null) {
    const res = await pool.query(
      'UPDATE users SET xp = xp + $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [Math.floor(amount), userId]
    );
    const user = res.rows[0];
    if (user && reason) {
      await this.logTransaction(userId, amount, 'xp_gain', reason, user.xp - amount);
    }
    return user;
  }

  /**
   * Zaktualizuj level użytkownika.
   * @param {number} userId
   * @param {number} level
   * @returns {Promise<Object>}
   */
  async setLevel(userId, level) {
    const res = await pool.query(
      'UPDATE users SET level = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [Math.max(1, Math.floor(level)), userId]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj badge'y użytkownika.
   * @param {number} userId
   * @param {string[]} badges
   * @returns {Promise<Object>}
   */
  async setBadges(userId, badges) {
    const res = await pool.query(
      'UPDATE users SET badges = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [Array.isArray(badges) ? badges : [], userId]
    );
    return res.rows[0];
  }

  /**
   * Dodaj badge użytkownikowi.
   * @param {number} userId
   * @param {string} badge
   * @returns {Promise<Object>}
   */
  async addBadge(userId, badge) {
    const res = await pool.query(
      `UPDATE users
       SET badges = array_append(badges, $1), updated_at = NOW()
       WHERE id = $2 AND NOT (badges @> array[$1]::text[])
       RETURNING *`,
      [String(badge), userId]
    );
    return res.rows[0];
  }

  /**
   * Usuń badge użytkownika.
   * @param {number} userId
   * @param {string} badge
   * @returns {Promise<Object>}
   */
  async removeBadge(userId, badge) {
    const res = await pool.query(
      `UPDATE users
       SET badges = array_remove(badges, $1), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [String(badge), userId]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj cooldown dzienny.
   * @param {number} userId
   * @param {Date} cooldown
   * @returns {Promise<Object>}
   */
  async setDailyCooldown(userId, cooldown) {
    const res = await pool.query(
      'UPDATE users SET daily_cooldown = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [cooldown instanceof Date ? cooldown : new Date(cooldown), userId]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj czas ostatniej pracy.
   * @param {number} userId
   * @param {Date} time
   * @returns {Promise<Object>}
   */
  async setLastWorkTime(userId, time) {
    const res = await pool.query(
      'UPDATE users SET last_work_time = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [time instanceof Date ? time : new Date(time), userId]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj aktywny wątek.
   * @param {number} userId
   * @param {string} threadId
   * @returns {Promise<Object>}
   */
  async setLastActiveThread(userId, threadId) {
    const res = await pool.query(
      'UPDATE users SET last_active_thread_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [String(threadId), userId]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj firmę użytkownika.
   * @param {number} userId
   * @param {number|null} companyId
   * @param {string} slot 'company' | 'company2'
   * @returns {Promise<Object>}
   */
  async setCompany(userId, companyId, slot = 'company') {
    const field = slot === 'company2' ? 'company2_id' : 'company_id';
    const res = await pool.query(
      `UPDATE users SET ${field} = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [companyId, userId]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj gang użytkownika.
   * @param {number} userId
   * @param {number|null} gangId
   * @returns {Promise<Object>}
   */
  async setGang(userId, gangId) {
    const res = await pool.query(
      'UPDATE users SET gang_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [gangId, userId]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj stan pożyczki.
   * @param {number} userId
   * @param {Object|null} loan
   * @returns {Promise<Object>}
   */
  async setActiveLoan(userId, loan) {
    const res = await pool.query(
      'UPDATE users SET active_loan = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [loan ? JSON.stringify(loan) : null, userId]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj stan zablokowania za saldo ujemne.
   * @param {number} userId
   * @param {boolean} blacklisted
   * @returns {Promise<Object>}
   */
  async setBlacklistedForNegativeBalance(userId, blacklisted) {
    const res = await pool.query(
      'UPDATE users SET blacklisted_for_negative_balance = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [blacklisted, userId]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj claimed milestones.
   * @param {number} userId
   * @param {Array} milestones
   * @returns {Promise<Object>}
   */
  async setClaimedMilestones(userId, milestones) {
    const res = await pool.query(
      'UPDATE users SET claimed_milestones = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [JSON.stringify(Array.isArray(milestones) ? milestones : []), userId]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj otwarte paczki dzisiaj.
   * @param {number} userId
   * @param {number} count
   * @param {string|null} date
   * @returns {Promise<Object>}
   */
  async setPackageOpens(userId, count, date = null) {
    const res = await pool.query(
      'UPDATE users SET opened_packages_today = $1, last_package_open_date = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [Math.max(0, count), date, userId]
    );
    return res.rows[0];
  }

  /**
   * Zaktualizuj count komend.
   * @param {number} userId
   * @param {Object} commandCounts
   * @returns {Promise<Object>}
   */
  async setCommandCounts(userId, commandCounts) {
    const res = await pool.query(
      'UPDATE users SET command_counts = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [JSON.stringify(commandCounts || {}), userId]
    );
    return res.rows[0];
  }

  /**
   * Pobierz użytkowników w gangu.
   * @param {number} gangId
   * @returns {Promise<Object[]>}
   */
  async getByGangId(gangId) {
    const res = await pool.query(
      'SELECT * FROM users WHERE gang_id = $1',
      [gangId]
    );
    return res.rows;
  }

  /**
   * Pobierz top użytkowników po saldzie.
   * @param {number} limit
   * @returns {Promise<Object[]>}
   */
  async getTopByBalance(limit = 10) {
    const res = await pool.query(
      'SELECT * FROM users ORDER BY balance DESC LIMIT $1',
      [limit]
    );
    return res.rows;
  }

  /**
   * Zaloguj transakcję.
   * @param {number} userId
   * @param {number} amount
   * @param {string} type
   * @param {string} reason
   * @param {number} balanceAfter
   * @param {Object} metadata
   */
  async logTransaction(userId, amount, type, reason, balanceAfter, metadata = {}) {
    await pool.query(
      `INSERT INTO transactions (user_id, amount, type, reason, balance_after, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, amount, String(type), String(reason || ''), balanceAfter, JSON.stringify(metadata)]
    );
  }

  /**
   * Pobierz historię transakcji użytkownika.
   * @param {number} userId
   * @param {number} limit
   * @param {number} offset
   * @returns {Promise<Object[]>}
   */
  async getTransactionHistory(userId, limit = 50, offset = 0) {
    const res = await pool.query(
      'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    return res.rows;
  }

  /**
   * Znajdź użytkowników według zapytania.
   * @param {Object} filters
   * @param {number} limit
   * @returns {Promise<Object[]>}
   */
  async search(filters = {}, limit = 20) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (filters.minLevel) {
      conditions.push(`level >= $${idx++}`);
      params.push(filters.minLevel);
    }
    if (filters.maxLevel) {
      conditions.push(`level <= $${idx++}`);
      params.push(filters.maxLevel);
    }
    if (filters.minBalance) {
      conditions.push(`balance >= $${idx++}`);
      params.push(filters.minBalance);
    }
    if (filters.gangId) {
      conditions.push(`gang_id = $${idx++}`);
      params.push(filters.gangId);
    }
    if (filters.hasBadge) {
      conditions.push(`badges @> $${idx++}::text[]`);
      params.push([filters.hasBadge]);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const res = await pool.query(
      `SELECT * FROM users ${where} ORDER BY balance DESC LIMIT $${idx}`,
      [...params, limit]
    );
    return res.rows;
  }

  /**
   * Oblicz sumę wszystkich sald.
   * @returns {Promise<bigint>}
   */
  async getTotalBalance() {
    const res = await pool.query('SELECT COALESCE(SUM(balance), 0) as total FROM users');
    return res.rows[0]?.total || 0;
  }

  /**
   * Oblicz sumę wszystkich banków.
   * @returns {Promise<bigint>}
   */
  async getTotalBank() {
    const res = await pool.query('SELECT COALESCE(SUM(bank), 0) as total FROM users');
    return res.rows[0]?.total || 0;
  }

  /**
   * Liczba użytkowników.
   * @returns {Promise<number>}
   */
  async count() {
    const res = await pool.query('SELECT COUNT(*) as count FROM users');
    return parseInt(res.rows[0]?.count || '0', 10);
  }
}

module.exports = new UsersRepository();
