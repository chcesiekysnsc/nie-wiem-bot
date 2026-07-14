const { withData } = require('../utils/storage');

const CATEGORY_LABELS = {
  test: '🧪 Testerzy komend',
  pomysl: '💡 Pomysłodawcy',
  czas: '⏳ Poświęcony czas'
};
const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS);
const creatorId = '100060812419294';

module.exports = {
  name: 'thx',
  aliases: ['dziekuje', 'podziekuj'],
  async execute(client, message, args) {
    if (message.author.id !== creatorId) {
      await message.reply('❌ Tylko twórca bota może zarządzać podziękowaniami.');
      return;
    }

    const sub = String(args[0] || '').toLowerCase();
    const isRemove = sub === 'usun' || sub === 'remove';
    const category = (isRemove ? args[1] : args[0] || '').toLowerCase();

    if (!VALID_CATEGORIES.includes(category)) {
      await message.reply(
        `❌ Nieprawidłowa kategoria. Dostępne: ${VALID_CATEGORIES.map(c => `\`${c}\` (${CATEGORY_LABELS[c]})`).join(', ')}\n\n` +
        `Użycie: **!thx <kategoria> <oznaczenie>** lub **!thx usun <kategoria> <oznaczenie>**`
      );
      return;
    }

    let targetId = null;
    const mentioned = message.mentions && message.mentions.users && message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
    } else {
      const rawArgs = isRemove ? args.slice(2) : args.slice(1);
      const idArg = rawArgs.find(a => /^\d{8,}$/.test(a));
      if (idArg) targetId = idArg;
    }

    if (!targetId) {
      await message.reply('❌ Oznacz osobę (@osoba) lub podaj jej ID.');
      return;
    }

    const targetName = await client.resolveUserName(client.api, targetId);

    const result = await withData(store => {
      store.profiles = store.profiles || {};
      store.profiles.podziekowania = store.profiles.podziekowania || {};
      store.profiles.podziekowania[category] = store.profiles.podziekowania[category] || [];
      const list = store.profiles.podziekowania[category];

      if (isRemove) {
        const before = list.length;
        store.profiles.podziekowania[category] = list.filter(e => e.id !== targetId);
        if (store.profiles.podziekowania[category].length === before) {
          return { error: `❌ ${targetName} nie znajduje się w kategorii ${CATEGORY_LABELS[category]}.` };
        }
        return { removed: true };
      }

      if (list.some(e => e.id === targetId)) {
        return { error: `❌ ${targetName} jest już w kategorii ${CATEGORY_LABELS[category]}.` };
      }
      list.push({ id: targetId, name: targetName, addedAt: Date.now() });
      return { added: true };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    if (result.removed) {
      await message.reply(`✅ Usunięto ${targetName} z podziękowań w kategorii: ${CATEGORY_LABELS[category]}`);
    } else {
      await message.reply(`✅ Dodano ${targetName} do podziękowań w kategorii: ${CATEGORY_LABELS[category]}`);
    }
  }
};
