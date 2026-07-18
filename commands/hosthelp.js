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
  { num: 15, cmd: '!gangreset', opis: 'Reset cooldownów gangów dla wszystkich. (Tylko twórca)' }
];

const adminCommands = [
  { num: 1, cmd: '!ublgrp', opis: 'Odbanowywanie grupy.' },
  { num: 2, cmd: '!ubl', opis: 'Odbanowywanie gracza.' },
  { num: 3, cmd: '!reakcja', opis: 'Ręczne wywołanie gry Szybkie Palce.' },
  { num: 4, cmd: '!group', opis: 'Informacje o grupie.' },
  { num: 5, cmd: '!flaga', opis: 'Ręczne wywołanie gry Zgadnij Kraj (flagi).' },
  { num: 6, cmd: '!blgrp', opis: 'Banowanie grupy.' },
  { num: 7, cmd: '!bl', opis: 'Banowanie gracza.' },
  { num: 8, cmd: '!aktualizuj', opis: 'Aktualizacja bota.' },
  { num: 9, cmd: '!loop', opis: 'Pętla komend.' },
  { num: 10, cmd: '!afkdel', opis: 'Usuwanie nieaktywnych członków z grupy.' }
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

    const creatorLines = creatorCommands.map(c => {
      return `👑 **${c.num}.** **${c.cmd}** — ${c.opis}`;
    }).join('\n');

    const adminLines = adminCommands.map(c => {
      return `🛡️ **${c.num}.** **${c.cmd}** — ${c.opis}`;
    }).join('\n');

    await message.reply(
      `👑 **KOMENDY TWÓRCY BOTA**\n${creatorLines}\n\n` +
      `🛡️ **KOMENDY ADMINISTRATORÓW BOTA**\n${adminLines}\n\n` +
      `💡 Użyj \`!admhelp\` aby zobaczyć starsze komendy admina.`
    );
  }
};
