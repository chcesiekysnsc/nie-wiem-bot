const config = require('../config/config');

const creatorCommands = [
  { cmd: '!thx', opis: 'Dodawanie/zarządzanie listą osób które pomogły przy bocie.' },
  { cmd: '!zezwol', opis: 'Zezwalanie na specjalne uprawnienia.' },
  { cmd: '!wersja', opis: 'Ustawianie wersji bota.' },
  { cmd: '!uadm', opis: 'Usuwanie administratorów bota.' },
  { cmd: '!adm', opis: 'Komenda administratora twórcy.' },
  { cmd: '!guardnick', opis: 'Blokowanie pseudonimu wybranego gracza.' },
  { cmd: '!danegrpinfo', opis: 'Sprawdzanie postępu analizy danych grup.' },
  { cmd: '!danegrp', opis: 'Błyskawiczna analiza bazodanowa wszystkich grup.' },
  { cmd: '!dane', opis: 'Zarządzanie danymi bota.' },
  { cmd: '!checkspam', opis: 'Sprawdzanie spamu.' },
  { cmd: '!backup', opis: 'Tworzenie backupu danych.' },
  { cmd: '!eventitemadd', opis: 'Dodawanie eventowych przedmiotów.' },
  { cmd: '!eventitemdel', opis: 'Usuwanie eventowych przedmiotów.' },
  { cmd: '!itemadd', opis: 'Dodawanie przedmiotów do ekwipunku.' },
  { cmd: '!loop', opis: 'Automatyczne dodawanie użytkowników z powrotem do grupy po wyjściu.' },
  { cmd: '!gangreset', opis: 'Reset cooldownów gangów dla wszystkich.' },
  { cmd: '!wymus', opis: 'Wymusza wybrany event !work na następnym worku.' },
  { cmd: '!odtworz', opis: 'Przywracanie danych z backupu.' },
  { cmd: '!stopdanegrpinfo', opis: 'Zatrzymuje analizę danych grupy.' },
  { cmd: '!kubl', opis: 'Dodawanie użytkownika do czarnej listy.' },
  { cmd: '!truebl', opis: 'Trwała czarna lista (tylko twórca może zdjąć).' },
  { cmd: '!swl <poziom>', opis: 'Ustawianie poziomu pracy (work level) dla dowolnego użytkownika.' },
  { cmd: '!superboss <wygrana> <obrona> <nazwa> <minuty>', opis: 'Tworzenie superbossa z walką dla graczy.' },
  { cmd: '!ochroniarze', opis: 'Zarządzanie ochroniarzami (automatyczne bomby/klodki).' }
];

module.exports = {
  name: 'hosthelp',
  aliases: ['hostpomoc'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';

    if (message.author.id !== creatorId) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const lines = creatorCommands.map(c => {
      return `👑 **${c.cmd}** — ${c.opis}`;
    }).join('\n');

    await message.reply(`👑 **KOMENDY TWÓRCY BOTA**\n${lines}`);
  }
};
