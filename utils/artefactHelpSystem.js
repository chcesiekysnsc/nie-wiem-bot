const { baseEmbed } = require('./embeds');

function buildArtefaktyCategoryPrompt(prefix = '!') {
  return baseEmbed()
    .setTitle('✨ Kolekcja Przedmiotów i Artefaktów')
    .setDescription(
      'Wybierz kategorię, którą chcesz zobaczyć:\n\n' +
      '1️⃣ 📦 Standardowe przedmioty\n' +
      '2️⃣ 🎁 Eventowe przedmioty\n\n' +
      '👉 Odpowiedz numerem (1-2) lub nazwą kategorii (np. "standardowe", "eventowe").\n' +
      '⏳ Masz 60 sekund na odpowiedź — tylko Ty możesz odpowiedzieć na to pytanie.'
    );
}

function buildArtefaktyCategoryList(categoryKey, items, prefix = '!') {
  const title = categoryKey === 'standardowe' ? '📦 Standardowe Przedmioty' : '🎁 Eventowe Przedmioty';
  const listText = items.map(item => {
    const awardText = item.award ? `${item.award} — ` : '';
    return `${item.num}. ${item.emoji} *${item.name}* — ${awardText}${item.shortDesc}`;
  }).join('\n');
  const helpHint = `💡 Szczegóły przedmiotu: \`${prefix}artefakty help <numer>\``;

  return baseEmbed()
    .setTitle(title)
    .setDescription(`${listText}\n\n${helpHint}`);
}

function buildGangArtefaktyCategoryPrompt(prefix = '!') {
  return baseEmbed()
    .setTitle('✨ Kolekcja Przedmiotów Gangowych')
    .setDescription(
      'Wybierz kategorię, którą chcesz zobaczyć:\n\n' +
      '1️⃣ 📦 Standardowe przedmioty gangowe\n' +
      '2️⃣ 🏆 Sezonowe artefakty\n\n' +
      '👉 Odpowiedz numerem (1-2) lub nazwą kategorii (np. "standardowe", "sezonowe").\n' +
      '⏳ Masz 60 sekund na odpowiedź — tylko Ty możesz odpowiedzieć na to pytanie.'
    );
}

function buildGangArtefaktyCategoryList(categoryKey, items, prefix = '!') {
  const title = categoryKey === 'standardowe' ? '📦 Standardowe Przedmioty Gangowe' : '🏆 Sezonowe Artefakty';
  const listText = items.map(item => `${item.num}. ${item.emoji} *${item.name}* — ${item.description}`).join('\n');
  const helpHint = `💡 Szczegóły przedmiotu: \`${prefix}gang artefakty <kategoria> help <numer>\``;

  return baseEmbed()
    .setTitle(title)
    .setDescription(`${listText}\n\n${helpHint}`);
}

const ARTEFAKTY_CATEGORY_ALIASES = {
  '1': 'standardowe',
  'standardowe': 'standardowe',
  'standard': 'standardowe',
  '2': 'eventowe',
  'eventowe': 'eventowe',
  'event': 'eventowe'
};

const GANG_ARTEFAKTY_CATEGORY_ALIASES = {
  '1': 'standardowe',
  'standardowe': 'standardowe',
  'standard': 'standardowe',
  '2': 'sezonowe',
  'sezonowe': 'sezonowe',
  'sezon': 'sezonowe',
  'artefakty': 'sezonowe',
  'sezonowe_artefakty': 'sezonowe'
};

function resolveArtefaktyCategory(input) {
  const normalized = String(input || '').toLowerCase().trim();
  return ARTEFAKTY_CATEGORY_ALIASES[normalized] || null;
}

function resolveGangArtefaktyCategory(input) {
  const normalized = String(input || '').toLowerCase().trim();
  return GANG_ARTEFAKTY_CATEGORY_ALIASES[normalized] || null;
}

module.exports = {
  buildArtefaktyCategoryPrompt,
  buildArtefaktyCategoryList,
  buildGangArtefaktyCategoryPrompt,
  buildGangArtefaktyCategoryList,
  resolveArtefaktyCategory,
  resolveGangArtefaktyCategory,
  ARTEFAKTY_CATEGORY_ALIASES,
  GANG_ARTEFAKTY_CATEGORY_ALIASES
};
