const config = require('../config/config');
const { withData } = require('../utils/storage');
const { hasItem, removeItem, ensureInventoryRecord } = require('../utils/economy');

module.exports = {
  name: 'wiezienie',
  aliases: [],
  async execute(client, message, args) {
    const senderId = message.author.id;
    const now = Date.now();

    const targetId = (() => {
      const mentioned = message.mentions && message.mentions.users && message.mentions.users.first;
      const user = typeof mentioned === 'function' ? mentioned.call(message.mentions.users) : null;
      if (user) return user.id;
      if (args[0] && /^\d+$/.test(args[0])) return args[0];
      return null;
    })();

    if (!targetId) {
      await message.reply('Użycie: **!wiezienie <@osoba>** lub **!wiezienie <id>**');
      return;
    }

    if (targetId === senderId) {
      await message.reply('Nie możesz wsadzić samego siebie do więzienia.');
      return;
    }

    const result = await withData(store => {
      const inventory = ensureInventoryRecord(store.inventory, senderId);
      if (!hasItem(inventory, 'klucz_wiezienny')) {
        return { error: 'Nie posiadasz Klucza Więziennego.' };
      }

      const users = store.users || {};
      if (!users[targetId]) {
        return { error: 'Nie znaleziono tego gracza.' };
      }

      const durationMs = (config.economy && config.economy.jailDurationMinutes ? config.economy.jailDurationMinutes : 30) * 60 * 1000;
      removeItem(inventory, 'klucz_wiezienny', 1);
      store.users[targetId].jailUntil = now + durationMs;
      return { ok: true, minutes: config.economy.jailDurationMinutes || 30 };
    });

    if (result && result.error) {
      await message.reply(result.error);
      return;
    }

    await message.reply(`🔑 Użyłeś Klucza Więziennego! Gracz został wsadzony do więzienia na ${result.minutes} minut.`);
  }
};
