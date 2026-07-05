const { withData, loadData } = require('./storage');

const REGISTRY = {
  crime_success: {
    id: 'crime_success',
    label: 'Napad (crime)',
    description: 'Podstawowa szansa na sukces napadu',
    default: 50,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    category: 'hazard'
  },
  rob_success: {
    id: 'rob_success',
    label: 'Okradanie (rob)',
    description: 'Podstawowa szansa na sukces okradania gracza',
    default: 60,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    category: 'prace'
  },
  work_luck: {
    id: 'work_luck',
    label: 'Praca (work)',
    description: 'Mnożnik szcześcia / przychodu z pracy',
    default: 1,
    min: 0.1,
    max: 10,
    step: 0.1,
    unit: '×',
    category: 'prace'
  },
  box_drop_luck: {
    id: 'box_drop_luck',
    label: 'Skrzynki (otworz)',
    description: 'Mnożnik szans na dropy ze skrzynek',
    default: 1,
    min: 0.1,
    max: 10,
    step: 0.1,
    unit: '×',
    category: 'skrzynki'
  },
  company_breakdown: {
    id: 'company_breakdown',
    label: 'Awaria firmy (firma)',
    description: 'Szansa na awarię firmy przy zbieraniu (0 = nigdy, 100 = zawsze)',
    default: 50,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    category: 'prace'
  },
  gang_heist_success: {
    id: 'gang_heist_success',
    label: 'Skok gangu (gang)',
    description: 'Podstawowa szansa na sukces skoku gangu',
    default: 50,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    category: 'gangi'
  },
  lottery_ticket_mult: {
    id: 'lottery_ticket_mult',
    label: 'Loterie (bilety)',
    description: 'Mnożnik wartości biletów loterii',
    default: 1,
    min: 0.1,
    max: 10,
    step: 0.1,
    unit: '×',
    category: 'losowania'
  },
  gielda_luck: {
    id: 'gielda_luck',
    label: 'Giełda (gielda)',
    description: 'Współczynnik losowości / mnożnik zmian',
    default: 1,
    min: 0.1,
    max: 10,
    step: 0.1,
    unit: '×',
    category: 'losowania'
  }
};

function getRegistry() {
  return REGISTRY;
}

async function getUserOverrides(userId) {
  return withData(store => {
    store.profiles = store.profiles || {};
    store.profiles.chanceOverrides = store.profiles.chanceOverrides || {};
    return store.profiles.chanceOverrides[userId] || {};
  });
}

async function saveUserOverrides(userId, overrides) {
  return withData(store => {
    store.profiles = store.profiles || {};
    store.profiles.chanceOverrides = store.profiles.chanceOverrides || {};
    store.profiles.chanceOverrides[userId] = { ...(store.profiles.chanceOverrides[userId] || {}), ...overrides };
    return { ok: true };
  });
}

async function getEffectiveChance(userId, systemId) {
  const entry = REGISTRY[systemId];
  if (!entry) return null;
  const overrides = await getUserOverrides(userId);
  if (overrides && overrides[systemId] !== undefined && overrides[systemId] !== null && overrides[systemId] !== '') {
    const v = Number(overrides[systemId]);
    return Number.isFinite(v) ? v : entry.default;
  }
  return entry.default;
}

async function getEffectiveLuck(userId, systemId) {
  const entry = REGISTRY[systemId];
  if (!entry) return 1;
  const overrides = await getUserOverrides(userId);
  if (overrides && overrides[systemId] !== undefined && overrides[systemId] !== null && overrides[systemId] !== '') {
    const v = Number(overrides[systemId]);
    return Number.isFinite(v) ? v : entry.default;
  }
  return entry.default;
}

module.exports = {
  REGISTRY,
  getRegistry,
  getUserOverrides,
  saveUserOverrides,
  getEffectiveChance,
  getEffectiveLuck
};
