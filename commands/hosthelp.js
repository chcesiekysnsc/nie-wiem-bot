const config = require('../config/config');

const creatorCommands = [
  { num: 1, cmd: '!thx', opis: 'Dodawanie/zarządzanie listą osób które pomogły przy bocie.' },
  { num: 2, cmd: '!zezwol', opis: 'Zezwalanie na specjalne uprawnienia.' },
  { num: 3, cmd: '!wersja', opis: 'Ustawianie wersji bota.' },
  { num: 4, cmd: '!uadm', opis: 'Usuwanie administratorów bota.' },
  { num: 5, cmd: '!adm', opis: 'Komenda administratora twórcy.' },
  { num: 6, cmd: '!guardnick', opis: 'Blokowanie pseudonimu wybranego gracza.' },
  { num: 7, cmd: '!danegrpinfo', opis: 'Sprawdzanie postępu analizy danych grup.' },
  { num: 8, cmd: '!danegrp', opis: 'Błyskawiczna analiza bazodanowa wszystkich grup.' },
  { num: 9, cmd: '!dane', opis: 'Zarządzanie danymi bota.' },
  { num: 10, cmd: '!checkspam', opis: 'Sprawdzanie spamu.' },
  { num: 11, cmd: '!backup', opis: 'Tworzenie backupu danych.' },
  { num: 12, cmd: '!eventitemadd', opis: 'Dodawanie eventowych przedmiotów. (Tylko twórca)' },
  { num: 13, cmd: '!eventitemdel', opis: 'Usuwanie eventowych przedmiotów. (Tylko twórca)' },
  { num: 14, cmd: '!itemadd', opis: 'Dodawanie przedmiotów do ekwipunku. (Tylko twórca)' },
  { num: 15, cmd: '!loop', opis: 'Automatyczne dodawanie użytkowników z powrotem do grupy po wyjściu. (!loop on — dla wszystkich, !loop <osoba> — dla konkretnego, !loop off — wyłącz)' },
  { num: 16, cmd: '!gangreset', opis: 'Reset cooldownów gangów dla wszystkich. (Tylko twórca)' }
];

module.exports = {
  name: 'hosthelp',
  aliases: ['hostpomoc'],
  async execute(client, message) {
    const creatorId = '100060812419294';

    if (message.author.id !== creatorId) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const lines = creatorCommands.map(c => {
      return `👑 **${c.num}.** **${c.cmd}** — ${c.opis}`;
    }).join('\n');

    await message.reply(`👑 **KOMENDY TWÓRCY BOTA**\n${lines}`);
  }
};
