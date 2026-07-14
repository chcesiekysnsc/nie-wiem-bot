const { loadData } = require('../utils/storage');

const CATEGORY_LABELS = {
  test: '🧪 Testerzy komend',
  pomysl: '💡 Pomysłodawcy',
  czas: '⏳ Poświęcony czas'
};
const CATEGORY_ORDER = ['test', 'pomysl', 'czas'];

module.exports = {
  name: 'podziekowania',
  aliases: ['thanks', 'credits', 'podziekowanie'],
  async execute(client, message, args) {
    const profiles = loadData('profiles');
    const dane = profiles.podziekowania || {};

    const sections = [];
    for (const cat of CATEGORY_ORDER) {
      const list = Array.isArray(dane[cat]) ? dane[cat] : [];
      if (list.length === 0) continue;
      const lines = list.map((entry, idx) => {
        const prefix = idx === list.length - 1 ? '└─' : '├─';
        return `${prefix} ${entry.name}`;
      }).join('\n');
      sections.push(`${CATEGORY_LABELS[cat]}:\n${lines}`);
    }

    if (sections.length === 0) {
      await message.reply('🙏 Nikt jeszcze nie został tu dodany. Twórca może dodać osoby komendą **!thx**.');
      return;
    }

    const body =
      `🙏 **PODZIĘKOWANIA**\n\n` +
      `Ten bot nie powstałby bez pomocy wspaniałych ludzi. Wielkie dzięki dla:\n\n` +
      sections.join('\n\n') +
      `\n\n━━━━━━━━━━━━━━━\nDziękujemy za wsparcie! 💙`;

    await message.reply(body);
  }
};
