const config = require('../config/config');
const { loadData } = require('./storage');

function getDefinitions() {
  return (config.territories && config.territories.definitions) || [];
}

function getTerritoryState() {
  const profiles = loadData('profiles') || {};
  return profiles.territories || { activeIds: [], owners: {}, nextRotationAt: 0 };
}

function getActiveTerritoriesForGang(gangId) {
  const state = getTerritoryState();
  const activeIds = state.activeIds || [];
  const owners = state.owners || {};
  const result = [];
  for (const id of activeIds) {
    if (owners[id] === gangId) {
      const def = getDefinitions().find(d => d.id === id);
      if (def) result.push(def);
    }
  }
  return result;
}

function getTerritoryBonus(gangId, bonusType) {
  const owned = getActiveTerritoriesForGang(gangId);
  let totalBonus = 0;
  for (const def of owned) {
    if (def.bonusType === bonusType) {
      totalBonus += def.bonusValue;
    } else if (def.bonusType === 'war_both' && (bonusType === 'gang_attack' || bonusType === 'gang_defense')) {
      totalBonus += def.bonusValue;
    } else if (def.bonusType === 'all_stats' && (bonusType === 'gang_attack' || bonusType === 'gang_defense' || bonusType === 'intel')) {
      totalBonus += def.bonusValue;
    } else if (def.bonusType === 'all_economy' && (bonusType === 'work' || bonusType === 'crime_reward' || bonusType === 'npc_raid')) {
      totalBonus += def.bonusValue;
    } else if (def.bonusType === 'reputation_gain') {
      totalBonus += def.bonusValue;
    }
  }
  return totalBonus;
}

function getOrderedActiveTerritories(gangId) {
  const state = getTerritoryState();
  const activeIds = state.activeIds || [];
  const owners = state.owners || {};
  const definitions = getDefinitions();

  const owned = [];
  const free = [];
  const others = [];

  for (const id of activeIds) {
    const def = definitions.find(d => d.id === id);
    if (!def) continue;
    const ownerId = owners[id] || null;
    const entry = { def, ownerId };
    if (ownerId === gangId) owned.push(entry);
    else if (!ownerId) free.push(entry);
    else others.push(entry);
  }

  return [...owned, ...free, ...others];
}

module.exports = {
  getDefinitions,
  getTerritoryState,
  getActiveTerritoriesForGang,
  getTerritoryBonus,
  getOrderedActiveTerritories
};
