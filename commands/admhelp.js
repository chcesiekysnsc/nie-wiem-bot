const config = require('../config/config');

const adminCommands = [
  { num: 1, cmd: '!admadd <kwota>', opis: 'Dodaj monety do swojego portfela.' },
  { num: 2, cmd: '!admgiv <kwota>', opis: 'Daj monety wszystkim graczom w grupie.' },
  { num: 3, cmd: '!agg <kwota>', opis: 'Daj monety wszystkim graczom globalnie (alias: !admgivglobal).' },
  { num: '3b', cmd: '!aggi <nr_itema> <ilość>', opis: 'Daj item wszystkim graczom globalnie.' },
  { num: 6, cmd: '!reset <procent>', opis: 'Usuwa dany % monet z konta każdego gracza.' },
  { num: 7, cmd: '!del <kwota> @osoba / ID', opis: 'Usuwa daną kwotę monet z portfela gracza.' },
  { num: 8, cmd: '!global <id_konta> on/off', opis: 'Włącz/wyłącz pokazywanie ID konta w rankingu.' },
  { num: 9, cmd: '!say <treść>', opis: 'Wysyła podaną treść na wszystkie aktywne grupy.' },
  { num: 13, cmd: '!reakcja', opis: 'Ręcznie wywołuje grę Szybkie Palce na obecnej grupie. Limit: 5 użyć/dzień.', limit: 5 },
  { num: 14, cmd: '!loteriastart', opis: 'Ręcznie uruchamia losowanie loterii.' },
  { num: 15, cmd: '!flaga', opis: 'Ręcznie wywołuje grę Zgadnij Kraj (flagi) na obecnej grupie. Limit: 5 użyć/dzień.', limit: 5 },
  { num: 16, cmd: '!dlug lista', opis: 'Pokazuje wszystkich dłużników i ich długi.' },
  { num: 17, cmd: '!admhelp', opis: 'Wyświetla tę pomoc.' }
];

module.exports = {
  name: 'admhelp',
  aliases: [],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień administratora.');
      return;
    }

    const lines = adminCommands.map(c => {
      const limitText = c.limit ? ` (Limit: ${c.limit}/dzień)` : '';
      return `👑 **${c.num}.** **${c.cmd}** — ${c.opis}${limitText}`;
    }).join('\n');
    await message.reply(`👑 **KOMENDY ADMINISTRACYJNE**\n${lines}`);
  }
};
