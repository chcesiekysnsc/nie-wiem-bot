const { loadData } = require('../utils/storage');
const { createUser } = require('../utils/storage');
const { formatCurrency } = require('../utils/economy');

const REPUTATION_RANKS = [
  { min: 0, name: 'Początkujący' },
  { min: 100, name: 'Uliczny Gang' },
  { min: 300, name: 'Znany Gang' },
  { min: 700, name: 'Organizacja' },
  { min: 1500, name: 'Syndykat' },
  { min: 3000, name: 'Imperium' },
  { min: 6000, name: 'Legenda' }
];

function getRank(reputation) {
  const rep = Math.max(0, Math.floor(reputation || 0));
  let current = REPUTATION_RANKS[0];
  for (const rank of REPUTATION_RANKS) {
    if (rep >= rank.min) current = rank;
    else break;
  }
  return current;
}

module.exports = {
  name: 'reputacja',
  aliases: ['rep', 'ranking_gangu'],
  async execute(client, message) {
    const profiles = loadData('profiles');
    const gangs = profiles.gangs || {};

    const sections = ['📊 SYSTEM REPUTACJI GANGU\n'];

    const user = createUser(message.author.id, profiles.users || {});
    if (user.gangId && gangs[user.gangId]) {
      const gang = gangs[user.gangId];
      const rep = Math.max(0, Math.floor(gang.reputation || 0));
      const rank = getRank(rep);
      sections.push(`🏅 Twój gang: ${gang.name} — ${rep} REP (${rank.name})\n`);
    }

    sections.push('Progi rang:');
    for (const rank of REPUTATION_RANKS) {
      const bonus = rank.min === 0 ? '' :
        rank.min === 100 ? ' (+5% do !work)' :
        rank.min === 300 ? ' (+2% szansy na udany !crime)' :
        rank.min === 700 ? ' (+5% nagrody z udanego !crime)' :
        rank.min === 1500 ? ' (-1h ochrony po wojnie)' :
        rank.min === 3000 ? ' (odblokowanie Elitarnych Najemników)' :
        '';
      sections.push(`${rank.min} REP — ${rank.name}${bonus}`);
    }

    sections.push('\nZdobywanie: wygrany atak +10, udana obrona +5, udany napad NPC +2, pokonanie silniejszego gangu +10 (dodatkowo)');
    sections.push('Utrata: przegrany atak -5, przegrana obrona -3, 7 dni braku aktywności -10');

    await message.reply(sections.join('\n'));
  }
};
