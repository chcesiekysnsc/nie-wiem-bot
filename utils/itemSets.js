const SET_DEFINITIONS = [
  {
    id: 'pracownika',
    name: 'Zestaw Pracownika',
    emoji: '💼',
    requiredItems: ['walizka', 'mocna_kawa', 'rekawice_robotnika', 'podrecznik_praktykanta'],
    bonuses: [
      { type: 'work_xp', value: 0.10, label: '+10% XP z !work' },
      { type: 'work_triple_chance', value: 0.05, label: '5% szans na potrójną wypłatę !work' }
    ]
  },
  {
    id: 'bankiera',
    name: 'Zestaw Bankiera',
    emoji: '💰',
    requiredItems: ['sejf', 'zlota_karta', 'ksiega_inwestora', 'dobra_ksiegowa'],
    bonuses: [
      { type: 'bank_interest', value: 0.02, label: '+2% dodatkowych odsetek' },
      { type: 'bank_capacity', value: 100000, label: '+100 000 miejsca w banku' }
    ]
  },
  {
    id: 'ochroniarza',
    name: 'Zestaw Ochroniarza',
    emoji: '🛡️',
    requiredItems: ['kamera', 'alarm', 'pies_strozujacy', 'patrol_policji'],
    bonuses: [
      { type: 'catch_chance', value: 0.04, label: '+4% szans na złapanie złodzieja' },
      { type: 'catch_penalty', value: 0.08, label: '+8% dodatkowej kary dla złodzieja' }
    ]
  },
  {
    id: 'hazardzisty',
    name: 'Zestaw Hazardzisty',
    emoji: '🎰',
    requiredItems: ['przekupiony_krupier', 'talizman_fortuny', 'kosc_ryzyka'],
    bonuses: [
      { type: 'casino_win', value: 0.03, label: '+3% do wszystkich wygranych hazardowych' }
    ]
  },
  {
    id: 'gangu',
    name: 'Zestaw Gangu',
    emoji: '🏴',
    requiredItems: ['godlo_gangu', 'insygnia_gang'],
    bonuses: [
      { type: 'gang_rewards', value: 0.10, label: '+10% nagród z aktywności gangowych' },
      { type: 'territory_rewards', value: 0.05, label: '+5% nagród z przejęć terytoriów' }
    ]
  },
  {
    id: 'biznesmena',
    name: 'Zestaw Biznesmena',
    emoji: '👔',
    requiredItems: ['garnitur', 'kaczka_biznesu', 'ksiega_inwestora', 'sakiewka_kolekcjonera'],
    bonuses: [
      { type: 'firm_income', value: 0.04, label: '+4% dochodu z firm' }
    ]
  },
  {
    id: 'vip',
    name: 'Zestaw VIP',
    emoji: '👑',
    requiredItems: ['vip', 'sakiewka_kolekcjonera', 'z_drive'],
    bonuses: [
      { type: 'cooldown_reduction', value: 0.05, label: 'Wszystkie cooldowny -5% (łącznie z Z-drive daje -20%)' }
    ]
  },
  {
    id: 'szybkosci',
    name: 'Zestaw Szybkości',
    emoji: '⚡',
    requiredItems: ['stary_zegar', 'z_drive'],
    bonuses: [
      { type: 'cooldown_reduction', value: 0.02, label: 'Dodatkowe -2% do wszystkich cooldownów' },
      { type: 'xp_gain', value: 0.05, label: '+5% XP z aktywności' }
    ]
  },
  {
    id: 'komendanta',
    name: 'Zestaw Komendanta',
    emoji: '🎖️',
    requiredItems: ['odznaka_komendanta', 'patrol_policji', 'kamera'],
    bonuses: [
      { type: 'crime_catch_reduction', value: 0.04, label: '-4% szansy na przyłapanie w !crime' }
    ]
  }
];

function getSetDefinitions() {
  return SET_DEFINITIONS;
}

function isSetComplete(setDef, inventory) {
  if (!inventory) return false;
  return setDef.requiredItems.every(itemId => (inventory[itemId] || 0) > 0);
}

function getCompletedSets(inventory) {
  return SET_DEFINITIONS.filter(set => isSetComplete(set, inventory));
}

function getItemSetBonus(inventory, bonusType) {
  const completed = getCompletedSets(inventory);
  let total = 0;
  for (const set of completed) {
    for (const bonus of set.bonuses) {
      if (bonus.type === bonusType) {
        total += bonus.value;
      }
    }
  }
  return total;
}

module.exports = {
  getSetDefinitions,
  isSetComplete,
  getCompletedSets,
  getItemSetBonus
};
