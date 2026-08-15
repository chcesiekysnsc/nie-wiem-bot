const config = require('../config/config');
const { helpCommands } = require('../utils/helpSystem');

module.exports = {
  name: 'admhelp',
  aliases: [],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień administratora.');
      return;
    }

    const prefix = message.prefix || '!';
    
    // Komendy dostępne tylko dla adminów bota (nie dla twórcy)
    const adminOnlyCommands = ['afkdel', 'aktualizuj', 'bl', 'blgrp', 'flaga', 'group', 'kick', 'loop', 'prefix', 'reakcja', 'ubl', 'ublgrp', 'wiadomosci', 'zakaz'];
    
    const adminCommands = helpCommands.filter(cmd => adminOnlyCommands.includes(cmd.name));

    const sorted = [...adminCommands].sort((a, b) => a.name.localeCompare(b.name));

    const lines = sorted.map((c, idx) => {
      return `🛡️ **${idx + 1}.** **${prefix}${c.name}** — ${c.shortDescription}`;
    }).join('\n');

    await message.reply(`🛡️ **KOMENDY ADMINISTRATORSKIE**\n${lines}\n\n💡 Szczegóły: \`${prefix}help <kategoria> <numer>\``);
  }
};
