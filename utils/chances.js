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
  },
  coinflip_win: {
    id: 'coinflip_win',
    label: 'Coinflip (wygrana)',
    description: 'Bazowa szansa na wygraną w !coinflip przed bonusami z odznak/przedmiotów',
    default: 48.5,
    min: 0,
    max: 100,
    step: 0.5,
    unit: '%',
    category: 'hazard'
  },
  roulette_win_luck: {
    id: 'roulette_win_luck',
    label: 'Ruletka (dodatkowa szansa)',
    description: 'Dodatkowa szansa na uratowanie przegranej w !ruletka i !multiruletka (jak odznaki/przedmioty)',
    default: 0,
    min: 0,
    max: 20,
    step: 0.5,
    unit: '%',
    category: 'hazard'
  },
  slots_win_luck: {
    id: 'slots_win_luck',
    label: 'Sloty (dodatkowa szansa)',
    description: 'Dodatkowa szansa na uratowanie przegranej w !slots (jak odznaki/przedmioty)',
    default: 0,
    min: 0,
    max: 20,
    step: 0.5,
    unit: '%',
    category: 'hazard'
  },
  rr_solo_survive: {
    id: 'rr_solo_survive',
    label: 'Rosyjska ruletka (solo, przeżycie)',
    description: 'Szansa przeżycia w trybie solo !rr (domyślnie 4/6 = 66.67%)',
    default: 66.67,
    min: 0,
    max: 100,
    step: 0.1,
    unit: '%',
    category: 'hazard'
  },
  rr_duel_bullet: {
    id: 'rr_duel_bullet',
    label: 'Rosyjska ruletka (pojedynek, komora z nabojem)',
    description: 'Szansa że pierwsza komora (challenger) ma nabój w pojedynku !rr acc (domyślnie 1/6)',
    default: 16.67,
    min: 0,
    max: 100,
    step: 0.1,
    unit: '%',
    category: 'hazard'
  },
  blackjack_save_luck: {
    id: 'blackjack_save_luck',
    label: 'Blackjack (dodatkowa szansa ratunku)',
    description: 'Dodatkowa szansa na uratowanie przegranej (bust/push) w !blackjack, jak odznaki/przedmioty',
    default: 0,
    min: 0,
    max: 20,
    step: 0.5,
    unit: '%',
    category: 'hazard'
  },
  bet_win_luck: {
    id: 'bet_win_luck',
    label: 'Bet (dodatkowa szansa)',
    description: 'Dodatkowe punkty procentowe do progu wygranej w !bet (single i multi-bet)',
    default: 0,
    min: 0,
    max: 20,
    step: 0.5,
    unit: 'pkt %',
    category: 'hazard'
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
