const config = require('../config/config');

const adminCommands = [
  { num: 1, cmd: '!admadd <kwota>', opis: 'Dodaj monety do swojego portfela.' },
  { num: 2, cmd: '!admgiv <kwota>', opis: 'Daj monety wszystkim graczom w grupie.' },
  { num: 3, cmd: '!admgivglobal <kwota>', opis: 'Daj monety wszystkim graczom globalnie.' },
  { num: 4, cmd: '!bl @osoba / ID', opis: 'Dodaj gracza do czarnej listy bota.' },
  { num: 5, cmd: '!ubl @osoba / ID', opis: 'Usuń gracza/grupę z czarnej listy bota.' },
  { num: 6, cmd: '!reset <procent>', opis: 'Usuwa dany % monet z konta każdego gracza.' },
  { num: 7, cmd: '!del <kwota> @osoba / ID', opis: 'Usuwa daną kwotę monet z portfela gracza.' },
  { num: 8, cmd: '!global <id_konta> on/off', opis: 'Włącz/wyłącz pokazywanie ID konta w rankingu.' },
  { num: 9, cmd: '!say <treść>', opis: 'Wysyła podaną treść na wszystkie aktywne grupy.' },
  { num: 10, cmd: '!grp', opis: 'Pokazuje listę obecnych grup, ich ID oraz saldo.' },
  { num: 11, cmd: '!blgrp <nr/ID grupy>', opis: 'Blokuje bota na wybranej grupie.' },
  { num: 12, cmd: '!ublgrp <nr/ID grupy>', opis: 'Odblokowuje bota na wybranej grupie.' },
  { num: 13, cmd: '!reakcja', opis: 'Ręcznie wywołuje grę Szybkie Palce na obecnej grupie.' },
  { num: 14, cmd: '!loteriastart', opis: 'Ręcznie uruchamia losowanie loterii.' },
  { num: 15, cmd: '!flaga', opis: 'Ręcznie wywołuje grę Zgadnij Kraj (flagi) na obecnej grupie.' },
  { num: 16, cmd: '!admhelp', opis: 'Wyświetla tę pomoc.' }
];

module.exports = {
  name: 'admhelp',
  aliases: [],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień administratora.');
      return;
    }

    const lines = adminCommands.map(c => `👑 **${c.num}.** \`${c.cmd}\` — ${c.opis}`).join('\n');
    await message.reply(`👑 **KOMENDY ADMINISTRACYJNE**\n${lines}`);
  }
};
