const pool = require('./config');
const config = require('../config/config');

async function syncConfig() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('[CONFIG-SYNC] Rozpoczynam synchronizację konfiguracji...');

    // 1. Synchronizuj przedmioty (shopItems) do tabeli `items`
    if (config.shopItems && typeof config.shopItems === 'object') {
      const items = Object.entries(config.shopItems);
      console.log(`[CONFIG-SYNC] Synchronizacja ${items.length} przedmiotów...`);
      for (const [itemId, item] of items) {
        await client.query(
          `INSERT INTO items (
            id, name, emoji, description, rarity, category,
            effect_type, effect_value, buyable, shop_note
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            emoji = EXCLUDED.emoji,
            description = EXCLUDED.description,
            rarity = EXCLUDED.rarity,
            category = EXCLUDED.category,
            effect_type = EXCLUDED.effect_type,
            effect_value = EXCLUDED.effect_value,
            buyable = EXCLUDED.buyable,
            shop_note = EXCLUDED.shop_note`,
          [
            String(itemId),
            String(item.name),
            String(item.emoji || ''),
            String(item.description || item.shortDesc || ''),
            String(item.rarity || 'common'),
            String(item.type || 'stackable'),
            item.effect_type ? String(item.effect_type) : null,
            Number(item.effect_value) || 0,
            item.buyable !== false,
            item.shopNote || null
          ]
        );
      }
    }

    // 2. Synchronizuj terytoria (territories.definitions) do tabeli `territory_definitions`
    const territoryDefs = (config.territories && config.territories.definitions) || [];
    if (territoryDefs.length > 0) {
      console.log(`[CONFIG-SYNC] Synchronizacja ${territoryDefs.length} terytoriów...`);
      for (const t of territoryDefs) {
        await client.query(
          `INSERT INTO territory_definitions (
            id, name, emoji, description, bonus_type, bonus_value
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            emoji = EXCLUDED.emoji,
            description = EXCLUDED.description,
            bonus_type = EXCLUDED.bonus_type,
            bonus_value = EXCLUDED.bonus_value`,
          [
            String(t.id),
            String(t.name),
            String(t.emoji || ''),
            String(t.description || ''),
            String(t.bonusType || ''),
            Number(t.bonusValue) || 0
          ]
        );
      }
    }

    // 3. Synchronizuj pozostałe sekcje konfiguracji do tabeli `game_config` jako JSON
    const sectionsToSync = {
      'config_companies': config.economy?.companies || {},
      'config_boss_crates': config.bossShopCrates || {},
      'config_badges': config.badges || {},
      'config_anti_spam': config.antiSpam || {},
      'config_cooldowns': config.cooldowns || {},
      'config_economy_general': {
        maxBet: config.economy?.maxBet,
        dailyMin: config.economy?.dailyMin,
        dailyMax: config.economy?.dailyMax,
        dailyVipBonus: config.economy?.dailyVipBonus,
        workMin: config.economy?.workMin,
        workMax: config.economy?.workMax,
        workVipBonus: config.economy?.workVipBonus,
        crimeSuccessChance: config.economy?.crimeSuccessChance,
        crimeWinMin: config.economy?.crimeWinMin,
        crimeWinMax: config.economy?.crimeWinMax,
        crimeLoseMin: config.economy?.crimeLoseMin,
        crimeLoseMax: config.economy?.crimeLoseMax,
        robSuccessChance: config.economy?.robSuccessChance,
        robMinTarget: config.economy?.robMinTarget,
        robMinPercent: config.economy?.robMinPercent,
        robMaxPercent: config.economy?.robMaxPercent,
        bankBaseCapacity: config.economy?.bankBaseCapacity,
        bankVipBonus: config.economy?.bankVipBonus,
        bankPrestigeBonus: config.economy?.bankPrestigeBonus,
        goldenCardBonus: config.economy?.goldenCardBonus,
        xpPerLevelBase: config.economy?.xpPerLevelBase,
        xpPerLevelGrowth: config.economy?.xpPerLevelGrowth,
        jailDurationMinutes: config.economy?.jailDurationMinutes
      }
    };

    for (const [key, val] of Object.entries(sectionsToSync)) {
      await client.query(
        `INSERT INTO game_config (key, value, value_type)
         VALUES ($1, $2, 'json')
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           updated_at = NOW()`,
        [key, JSON.stringify(val)]
      );
    }

    await client.query('COMMIT');
    console.log('[CONFIG-SYNC] Synchronizacja konfiguracji zakończona sukcesem.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[CONFIG-SYNC] [ERROR] Błąd synchronizacji konfiguracji:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { syncConfig };
