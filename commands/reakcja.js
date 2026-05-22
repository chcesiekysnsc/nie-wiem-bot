const { formatCurrency } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const config = require('../config/config');

module.exports = {
  name: 'reakcja',
  aliases: [],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień administratora.');
      return;
    }

    if (!client.activeReactions) {
      client.activeReactions = new Map();
    }

    const threadId = message.guild.id;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const prize = 5000;

    client.activeReactions.set(threadId, {
      code,
      prize,
      active: true,
      timestamp: Date.now()
    });

    // Auto-cleanup after 5 minutes
    setTimeout(() => {
      const game = client.activeReactions.get(threadId);
      if (game && game.code === code && game.active) {
        client.activeReactions.delete(threadId);
        if (client.api) {
          client.api.sendMessage(`⌛ **SZYBKIE PALCE** ⌛\nCzas minął! Nikt nie przepisał kodu **\`${code}\`** na czas.`, threadId);
        }
      }
    }, 5 * 60 * 1000).unref();

    await message.reply(`⚡ **SZYBKIE PALCE** ⚡\nKto pierwszy przepisze poniższy kod, wygrywa **${formatCurrency(prize)}**!\n\n👉 **\`${code}\`**`);
  }
};
