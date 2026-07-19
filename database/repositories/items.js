/**
 * database/repositories/items.js
 *
 * Repozytorium przedmiotów i ekwipunku.
 */

const pool = require('../config');

class ItemsRepository {
  /**
   * Pobierz definicję przedmiotu.
   * @param {string} itemId
   * @returns {Promise<Object|null>}
   */
  async getDefinition(itemId) {
    const res = await pool.query('SELECT * FROM items WHERE id = $1', [String(itemId)]);
    return res.rows[0] || null;
  }

  /**
   * Pobierz wszystkie definicje przedmiotów.
   * @returns {Promise<Object[]>}
   */
  async getAllDefinitions() {
    const res = await pool.query('SELECT * FROM items ORDER BY id');
    return res.rows;
  }

  /**
   * Pobierz definicje według kategorii.
   * @param {string} category
   * @returns {Promise<Object[]>}
   */
  async getByCategory(category) {
    const res = await pool.query('SELECT * FROM items WHERE category = $1 ORDER BY id', [String(category)]);
    return res.rows;
  }

  /**
   * Pobierz definicje według efektu.
   * @param {string} effectType
   * @returns {Promise<Object[]>}
   */
  async getByEffectType(effectType) {
    const res = await pool.query('SELECT * FROM items WHERE effect_type = $1 ORDER BY id', [String(effectType)]);
    return res.rows;
  }

  /**
   * Pobierz ekwipunek użytkownika.
   * @param {number} userId
   * @returns {Promise<Object>} { itemId: amount }
   */
  async getInventory(userId) {
    const res = await pool.query(
      'SELECT item_id, amount FROM inventory WHERE user_id = $1',
      [userId]
    );
    const inventory = {};
    for (const row of res.rows) {
      inventory[row.item_id] = row.amount;
    }
    return inventory;
  }

  /**
   * Dodaj przedmiot do ekwipunku.
   * @param {number} userId
   * @param {string} itemId
   * @param {number} amount
   * @returns {Promise<void>}
   */
  async addItem(userId, itemId, amount) {
    await pool.query(
      `INSERT INTO inventory (user_id, item_id, amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, item_id) DO UPDATE SET
         amount = inventory.amount + EXCLUDED.amount,
         obtained_at = NOW()`,
      [userId, String(itemId), Math.max(0, Math.floor(amount))]
    );
  }

  /**
   * Usuń przedmiot z ekwipunku.
   * @param {number} userId
   * @param {string} itemId
   * @param {number} amount
   * @returns {Promise<boolean>} true jeśli usunięto
   */
  async removeItem(userId, itemId, amount) {
    const res = await pool.query(
      `UPDATE inventory
       SET amount = amount - $1
       WHERE user_id = $2 AND item_id = $3 AND amount >= $1
       RETURNING amount`,
      [Math.floor(amount), userId, String(itemId)]
    );
    if (res.rows.length > 0 && res.rows[0].amount <= 0) {
      await pool.query('DELETE FROM inventory WHERE user_id = $1 AND item_id = $2', [userId, String(itemId)]);
    }
    return res.rows.length > 0;
  }

  /**
   * Ustaw ilość przedmiotu.
   * @param {number} userId
   * @param {string} itemId
   * @param {number} amount
   * @returns {Promise<void>}
   */
  async setItemAmount(userId, itemId, amount) {
    if (amount <= 0) {
      await pool.query('DELETE FROM inventory WHERE user_id = $1 AND item_id = $2', [userId, String(itemId)]);
    } else {
      await pool.query(
        `INSERT INTO inventory (user_id, item_id, amount)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, item_id) DO UPDATE SET amount = EXCLUDED.amount`,
        [userId, String(itemId), Math.floor(amount)]
      );
    }
  }

  /**
   * Sprawdź czy użytkownik ma przedmiot.
   * @param {number} userId
   * @param {string} itemId
   * @param {number} minAmount
   * @returns {Promise<boolean>}
   */
  async hasItem(userId, itemId, minAmount = 1) {
    const res = await pool.query(
      'SELECT amount FROM inventory WHERE user_id = $1 AND item_id = $2',
      [userId, String(itemId)]
    );
    const row = res.rows[0];
    return row ? Number(row.amount) >= minAmount : false;
  }

  /**
   * Pobierz wszystkie przedmioty użytkownika z definicjami.
   * @param {number} userId
   * @returns {Promise<Object[]>}
   */
  async getInventoryWithDefinitions(userId) {
    const res = await pool.query(
      `SELECT i.item_id, i.amount, it.*
       FROM inventory i
       LEFT JOIN items it ON it.id = i.item_id
       WHERE i.user_id = $1
       ORDER BY it.category, it.name`,
      [userId]
    );
    return res.rows;
  }

  /**
   * Oblicz bonusy użytkownika dla danego typu efektu.
   * Sumuje wszystkie aktywne efekty z przedmiotów.
   * @param {number} userId
   * @param {string} effectType
   * @returns {Promise<number>}
   */
  async getUserBonus(userId, effectType) {
    const res = await pool.query(
      `SELECT COALESCE(SUM(it.effect_value), 0) as total
       FROM inventory i
       JOIN items it ON it.id = i.item_id
       WHERE i.user_id = $1
         AND it.effect_type = $2
         AND i.amount > 0`,
      [userId, String(effectType)]
    );
    return Number(res.rows[0]?.total || 0);
  }

  /**
   * Oblicz wszystkie bonusy użytkownika.
   * @param {number} userId
   * @returns {Promise<Object>} { effectType: totalValue }
   */
  async getAllUserBonuses(userId) {
    const res = await pool.query(
      `SELECT it.effect_type, COALESCE(SUM(it.effect_value), 0) as total
       FROM inventory i
       JOIN items it ON it.id = i.item_id
       WHERE i.user_id = $1 AND i.amount > 0 AND it.effect_type IS NOT NULL
       GROUP BY it.effect_type`,
      [userId]
    );
    const bonuses = {};
    for (const row of res.rows) {
      bonuses[row.effect_type] = Number(row.total);
    }
    return bonuses;
  }

  /**
   * Dodaj definicję przedmiotu.
   * @param {Object} item
   * @returns {Promise<Object>}
   */
  async addDefinition(item) {
    const res = await pool.query(
      `INSERT INTO items (id, name, emoji, description, rarity, category, effect_type, effect_value, buyable, shop_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         emoji = EXCLUDED.emoji,
         description = EXCLUDED.description,
         rarity = EXCLUDED.rarity,
         category = EXCLUDED.category,
         effect_type = EXCLUDED.effect_type,
         effect_value = EXCLUDED.effect_value,
         buyable = EXCLUDED.buyable,
         shop_note = EXCLUDED.shop_note
       RETURNING *`,
      [
        String(item.id),
        String(item.name),
        String(item.emoji || ''),
        String(item.description || ''),
        String(item.rarity || 'common'),
        String(item.category || ''),
        item.effect_type ? String(item.effect_type) : null,
        Number(item.effect_value) || 0,
        item.buyable !== false,
        item.shop_note || null
      ]
    );
    return res.rows[0];
  }

  /**
   * Dodaj wiele definicji przedmiotów.
   * @param {Object[]} items
   * @returns {Promise<Object[]>}
   */
  async addDefinitions(items) {
    const result = [];
    for (const item of items) {
      const created = await this.addDefinition(item);
      result.push(created);
    }
    return result;
  }
}

module.exports = new ItemsRepository();
