const config = require('../config/config');

const adminCommands = [
  { num: 1, cmd: '!admadd <kwota>', opis: 'Dodaj monety do swojego portfela.' },
  { num: 2, cmd: '!admgiv <kwota>', opis: 'Daj monety wszystkim graczom w grupie.' },
  { num: 3, cmd: '!bl @osoba / ID', opis: 'Dodaj gracza do czarnej listy bota.' },
  { num: 4, cmd: '!ubl @osoba / ID', opis: 'Usuń gracza z czarnej listy bota.' },
  { num: 5, cmd: '!reset <procent>', opis: 'Usuwa dany % monet z konta każdego gracza.' },
  { num: 6, cmd: '!del <kwota> @osoba / ID', opis: 'Usuwa daną kwotę monet z portfela gracza.' },
  { num: 7, cmd: '!admhelp', opis: 'Wyświetla tę pomoc.' }
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
