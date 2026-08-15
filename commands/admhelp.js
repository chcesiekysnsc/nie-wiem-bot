const config = require('../config/config');

const adminCommands = [
  { cmd: '!afkdel', opis: 'Usuwa nieaktywnych członków z grupy.' },
  { cmd: '!aktualizuj', opis: 'Aktualizuje bota.' },
  { cmd: '!bl', opis: 'Banuje gracza.' },
  { cmd: '!blgrp', opis: 'Banuje grupę.' },
  { cmd: '!flaga', opis: 'Ręcznie wywołuje grę Zgadnij Kraj (flagi) na obecnej grupie.' },
  { cmd: '!group', opis: 'Pokazuje informacje o grupie.' },
  { cmd: '!kick', opis: 'Wyrzuca użytkownika z grupy.' },
  { cmd: '!loop', opis: 'Wykonuje pętlę komend.' },
  { cmd: '!prefix', opis: 'Zmienia prefix bota w grupie.' },
  { cmd: '!reakcja', opis: 'Ręcznie wywołuje grę Szybkie Palce na obecnej grupie. Limit: 5 użyć/dzień.', limit: 5 },
  { cmd: '!ubl', opis: 'Odbanowuje gracza.' },
  { cmd: '!ublgrp', opis: 'Odbanowuje grupę.' },
  { cmd: '!wiadomosci', opis: 'Zarządzanie powiadomieniami powitalnymi.' },
  { cmd: '!zakaz', opis: 'Zakazywanie używania komend w grupie.' }
];

module.exports = {
  name: 'admhelp',
  aliases: [],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień administratora.');
      return;
    }

    const sorted = [...adminCommands].sort((a, b) => a.cmd.localeCompare(b.cmd));

    const lines = sorted.map((c, idx) => {
      const limitText = c.limit ? ` (Limit: ${c.limit}/dzień)` : '';
      return `🛡️ **${idx + 1}.** **${c.cmd}** — ${c.opis}${limitText}`;
    }).join('\n');

    await message.reply(`🛡️ **KOMENDY ADMINISTRATORSKIE**\n${lines}`);
  }
};
