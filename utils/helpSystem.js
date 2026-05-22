const { EmbedBuilder } = require('./embeds');
const config = require('../config/config');

const HELP_PAGE_SIZE = 7;

const CATEGORY_META = {
  ECONOMY: { label: 'ECONOMY' },
  GAMBLING: { label: 'GAMBLING' },
  SOCIAL: { label: 'SOCIAL' },
  ADMIN: { label: 'ADMIN' },
  UTILITY: { label: 'UTILITY' }
};

const helpCommands = [
  {
    id: 1,
    name: 'help',
    category: 'UTILITY',
    shortDescription: 'wyswietla pomoc',
    description: 'Wyświetla listę wszystkich dostępnych komend lub szczegółowy opis wybranej komendy.',
    usage: '!help [numer/nazwa]',
    examples: ['!help', '!help 2', '!help bal'],
    cooldown: 'Brak.',
    requirements: 'Brak.',
    aliases: ['pomoc', 'commands'],
    additionalInfo: []
  },
  {
    id: 2,
    name: 'bal',
    category: 'ECONOMY',
    shortDescription: 'pokazuje saldo',
    description: 'Pokazuje stan portfela, banku oraz podstawowe statystyki konta.',
    usage: '!bal [@osoba | id]',
    examples: ['!bal', '!bal @Rafal'],
    cooldown: '2 sekundy',
    requirements: 'Brak.',
    aliases: ['balance', 'kasa', 'saldo'],
    additionalInfo: [
      'Pokazuje portfel i bank.'
    ]
  },
  {
    id: 3,
    name: 'daily',
    category: 'ECONOMY',
    shortDescription: 'odbierz dzienna nagrode',
    description: 'Odbiera codzienną nagrodę.',
    usage: '!daily',
    examples: ['!daily'],
    cooldown: 'Nagroda co 24h',
    requirements: 'Musisz odczekac 24 godziny od poprzedniego claimu.',
    aliases: [],
    additionalInfo: [
      'VIP Pass zwieksza wysokosc daily.',
      'Dzienny streak dodaje bonus.'
    ]
  },
  {
    id: 4,
    name: 'work',
    category: 'ECONOMY',
    shortDescription: 'zarob coinsy pracujac',
    description: 'Zarób coins za uczciwą pracę.',
    usage: '!work',
    examples: ['!work'],
    cooldown: '10 sekund',
    requirements: 'Brak.',
    aliases: [],
    additionalInfo: [
      'VIP Pass daje bonus do wyplat.'
    ]
  },
  {
    id: 5,
    name: 'crime',
    category: 'ECONOMY',
    shortDescription: 'ryzykowna kradziez NPC',
    description: 'Napad na NPC — zysk lub strata.',
    usage: '!crime',
    examples: ['!crime'],
    cooldown: '12 sekund',
    requirements: 'Brak.',
    aliases: [],
    additionalInfo: [
      'Ryzykowna akcja.'
    ]
  },
  {
    id: 6,
    name: 'top',
    category: 'ECONOMY',
    shortDescription: 'ranking top 5 global i grupy',
    description: 'Pokazuje 5 najbogatszych graczy.',
    usage: '!top',
    examples: ['!top'],
    cooldown: '8 sekund',
    requirements: 'Brak.',
    aliases: ['ranking'],
    additionalInfo: [
      'Łączny majątek (portfel + bank).'
    ]
  },
  {
    id: 7,
    name: 'wplac',
    category: 'ECONOMY',
    shortDescription: 'wplac coinsy do banku',
    description: 'Przenosi coins z portfela do banku.',
    usage: '!wplac kwota',
    examples: ['!wplac 1000', '!wplac all'],
    cooldown: '3 sekundy',
    requirements: 'Musisz miec miejsce w banku.',
    aliases: ['deposit', 'dep'],
    additionalInfo: [
      'VIP zwieksza pojemnosc banku.'
    ]
  },
  {
    id: 8,
    name: 'wyplac',
    category: 'ECONOMY',
    shortDescription: 'wyplac coinsy z banku',
    description: 'Wyjmuje coinsy z banku do portfela.',
    usage: '!wyplac kwota',
    examples: ['!wyplac 5000', '!wyplac all'],
    cooldown: '3 sekundy',
    requirements: 'Musisz miec coins w banku.',
    aliases: ['withdraw', 'with'],
    additionalInfo: [
      'Obsluguje all i max.'
    ]
  },
  {
    id: 9,
    name: 'sklep',
    category: 'ECONOMY',
    shortDescription: 'sklep kasynowy',
    description: 'Pozwala kupić przedmioty z oferty.',
    usage: '!sklep <nr_itemu> [ilosc]',
    examples: ['!sklep 3 2'],
    cooldown: '3 sekundy',
    requirements: 'Wystarczajacy balance.',
    aliases: ['shop', 'sklp', 'store'],
    additionalInfo: [
      'Kupuj po numerze z listy.'
    ]
  },
  {
    id: 10,
    name: 'eq',
    category: 'ECONOMY',
    shortDescription: 'twoj ekwipunek',
    description: 'Pokazuje posiadane przedmioty.',
    usage: '!eq [@osoba | id]',
    examples: ['!eq', '!eq @Rafal'],
    cooldown: '3 sekundy',
    requirements: 'Brak.',
    aliases: ['inv', 'ekwipunek', 'inventory'],
    additionalInfo: [
      'Wyświetla kupione przedmioty.'
    ]
  },
  {
    id: 11,
    name: 'use',
    category: 'ECONOMY',
    shortDescription: 'uzyj itemu z ekwipunku',
    description: 'Sprawdz dzialanie itemu. Klodka i Piwo dzialaja automatycznie.',
    usage: '!use <nr_itemu>',
    examples: ['!use 1', '!use 3'],
    cooldown: '2 sekundy',
    requirements: 'Musisz posiadac dany item.',
    aliases: ['uzyj'],
    additionalInfo: [
      'Pokazuje informacje o przedmiocie.'
    ]
  },
  {
    id: 12,
    name: 'tip',
    category: 'ECONOMY',
    shortDescription: 'przelej coinsy innemu graczowi',
    description: 'Przelewa coinsy innemu graczowi.',
    usage: '!tip <kwota> @osoba | !tip <kwota> <id>',
    examples: ['!tip 1000 @Rafal', '!tip all 123456'],
    cooldown: '3 sekundy',
    requirements: 'Musisz miec odpowiedni balance.',
    aliases: ['przelej', 'daj'],
    additionalInfo: [
      'Obsługuje all.'
    ]
  },
  {
    id: 13,
    name: 'reakcja',
    category: 'ECONOMY',
    shortDescription: 'informacje o szybkich palcach',
    description: 'Gra zręcznościowa wywoływana automatycznie na czacie grupowym co 20-60 minut lub ręcznie przez administratora. Kto pierwszy przepisz kod, wygrywa 5 000 Coins!',
    usage: '!reakcja (tylko admin)',
    examples: ['!reakcja'],
    cooldown: 'Brak.',
    requirements: 'Wymaga bycia pierwszym na czacie.',
    aliases: [],
    additionalInfo: [
      'Nagroda za poprawny kod wynosi 5 000 Coins.',
      'Wygenerowany kod wygasa po upływie 5 minut.'
    ]
  },
  {
    id: 14,
    name: 'slots',
    category: 'GAMBLING',
    shortDescription: 'automaty kasynowe',
    description: 'Zagraj na jednorękim bandycie.',
    usage: '!slots <kwota>',
    examples: ['!slots 1000', '!slots all'],
    cooldown: '4 sekundy',
    requirements: 'Balance na bet.',
    aliases: ['slot'],
    additionalInfo: []
  },
  {
    id: 15,
    name: 'coinflip',
    category: 'GAMBLING',
    shortDescription: 'rzut moneta',
    description: 'Obstaw orła lub reszkę i podwój stawkowanie.',
    usage: '!coinflip <kwota> <orzel/reszka> | !cf <kwota> <orzel/reszka>',
    examples: ['!coinflip 1000 orzel', '!cf 5000 reszka'],
    cooldown: '4 sekundy',
    requirements: 'Balance na bet.',
    aliases: ['cf'],
    additionalInfo: []
  },
  {
    id: 16,
    name: 'ruletka',
    category: 'GAMBLING',
    shortDescription: 'ruletka',
    description: 'Obstaw kolor lub numer w ruletce.',
    usage: '!ruletka <kwota> <czerwony/czarny/zielony/parzyste/nieparzyste/0-36>',
    examples: ['!ruletka 1000 czerwony'],
    cooldown: '5 sekund',
    requirements: 'Balance na bet.',
    aliases: ['roulette', 'roul'],
    additionalInfo: [
      'Różne mnożniki zysków.'
    ]
  },
  {
    id: 17,
    name: 'bet',
    category: 'GAMBLING',
    shortDescription: 'zaklad liczbowy',
    description: 'Postaw zakład na to, że wylosowana liczba 0-99 będzie mniejsza niż Twój typ.',
    usage: '!bet <kwota> <liczba 1-90>',
    examples: ['!bet 1000 50'],
    cooldown: '3 sekundy',
    requirements: 'Balance na bet.',
    aliases: [],
    additionalInfo: [
      'Im mniejsza liczba, tym większy mnożnik.'
    ]
  },
  {
    id: 18,
    name: 'blackjack',
    category: 'GAMBLING',
    shortDescription: 'gra w blackjacka (oczko)',
    description: 'Klasyczna gra w Blackjacka przeciwko krupierowi. Dobieraj karty (hit), pasuj (stand) lub podwajaj stawke (double).',
    usage: '!blackjack <kwota> | !bj <kwota>',
    examples: ['!blackjack 1000', '!bj all'],
    cooldown: '3 sekundy',
    requirements: 'Balance na bet.',
    aliases: ['bj'],
    additionalInfo: [
      'Blackjack (As + 10) placi bonus 2.5x!',
      'Krupier dobiera do 17.'
    ]
  },
  {
    id: 19,
    name: 'rr',
    category: 'GAMBLING',
    shortDescription: 'rosyjska ruletka ze stawka',
    description: 'Zagraj w rosyjską ruletkę solo przeciwko rewolwerowi (szansa na wygraną 5/6, wypłata 1.2x) lub wyzwij innego gracza na pojedynek.',
    usage: '!rr <kwota> [@osoba] | !rr acc | !rr dec',
    examples: ['!rr 1000', '!rr 5000 @Kowalski'],
    cooldown: '5 sekund',
    requirements: 'Balance na bet.',
    aliases: ['rosyjska', 'ruletkarosyjska'],
    additionalInfo: [
      'Wyzwanie trwa 2 minuty.',
      'Pojedynek toczy się do pierwszego strzału ze wzrastającym ryzykiem.'
    ]
  },
  {
    id: 20,
    name: 'rob',
    category: 'SOCIAL',
    shortDescription: 'okradnij gracza',
    description: 'Spróbuj okraść innego gracza.',
    usage: '!rob @osoba | !rob <id>',
    examples: ['!rob @Rafal'],
    cooldown: '30 minut',
    requirements: 'Cel musi mieć min. 1 000 Coins.',
    aliases: ['okradnij'],
    additionalInfo: [
      'Kłódka broni, Piwo modyfikuje szanse.'
    ]
  },
  {
    id: 21,
    name: 'marry',
    category: 'SOCIAL',
    shortDescription: 'slub z graczem',
    description: 'Oświadcz się innemu graczowi.',
    usage: '!marry <id> | !marry accept <id> | !marry decline <id>',
    examples: ['!marry 123456'],
    cooldown: '12 sekund',
    requirements: 'Obie osoby muszą być wolne.',
    aliases: ['slub'],
    additionalInfo: [
      'Oświadczyny trwają 2 minuty.'
    ]
  },
  {
    id: 22,
    name: 'pfp',
    category: 'SOCIAL',
    shortDescription: 'profil kasynowy',
    description: 'Pokazuje profil gracza z danymi.',
    usage: '!pfp [@osoba | id]',
    examples: ['!pfp @Rafal'],
    cooldown: '4 sekundy',
    requirements: 'Brak.',
    aliases: ['profile', 'profil', 'awatar'],
    additionalInfo: [
      'Pokazuje stan konta i odznaki.'
    ]
  },
  {
    id: 23,
    name: 'rozwod',
    category: 'SOCIAL',
    shortDescription: 'rozwod z graczem',
    description: 'Bierze rozwód z obecnym małżonkiem.',
    usage: '!rozwod',
    examples: ['!rozwod'],
    cooldown: '3 sekundy',
    requirements: 'Musisz być w związku.',
    aliases: ['divorce'],
    additionalInfo: [
      'Czyści stan małżeństwa.'
    ]
  },
  {
    id: 24,
    name: 'duel',
    category: 'SOCIAL',
    shortDescription: 'pojedynek o monety',
    description: 'Wyzywa innego gracza na pojedynek o stawkę.',
    usage: '!duel <kwota> @osoba',
    examples: ['!duel 1000 @Kowalski'],
    cooldown: '3 sekundy',
    requirements: 'Obaj gracze muszą posiadać stawkę.',
    aliases: ['pojedynek'],
    additionalInfo: [
      'Akceptacja: !duel acc, Odrzucenie: !duel dec.'
    ]
  },
  {
    id: 25,
    name: 'gang',
    category: 'SOCIAL',
    shortDescription: 'zarzadzanie i interakcje gangu',
    description: 'System gangów: zakładanie, wspólny sejf, ulepszenia Dziupli, Biznesów i Fachu, oraz skoki.',
    usage: '!gang [stworz/zapros/dolacz/awans/wyrzuc/opusc/wplac/wyplac/ulepsz/skok/info]',
    examples: ['!gang stworz MojaEkipa', '!gang zapros @Kowalski', '!gang wplac 5000', '!gang ulepsz dziupla', '!gang skok', '!gang info'],
    cooldown: '3 sekundy',
    requirements: 'Zakładanie gangu kosztuje 1 000 000 Coins. Skok gangu wymaga min. 2 graczy.',
    aliases: ['gangi'],
    additionalInfo: [
      'Boss i Zastępcy zarządzają gangiem.',
      'Ulepszenia dają bonusy do pracy i kradzieży.'
    ]
  },
  {
    id: 26,
    name: 'awans',
    category: 'SOCIAL',
    shortDescription: 'awansuj czlonka gangu',
    description: 'Skrót do awansowania członka gangu na stanowisko Zastępcy. Dostępne tylko dla Bossa.',
    usage: '!awans @osoba',
    examples: ['!awans @Kowalski'],
    cooldown: '3 sekundy',
    requirements: 'Musisz być Bossem gangu.',
    aliases: [],
    additionalInfo: [
      'Zastępcy mogą zapraszać i wyrzucać zwykłych członków.'
    ]
  },
  {
    id: 27,
    name: 'loteria',
    category: 'ECONOMY',
    shortDescription: 'informacje o loterii',
    description: 'Pokazuje informacje o loterii, pulę nagród, liczbę kupionych biletów oraz czas do następnego losowania. Bilety kupuje się w sklepie (!sklep 5).',
    usage: '!loteria',
    examples: ['!loteria'],
    cooldown: '3 sekundy',
    requirements: 'Brak.',
    aliases: ['lottery'],
    additionalInfo: []
  },
  {
    id: 28,
    name: 'podatki',
    category: 'ECONOMY',
    shortDescription: 'informacje o podatkach',
    description: 'Pokazuje informacje o podatkach w grze: podatek od salda (2% co 12h) oraz podatek od przelewów (5% przy !tip).',
    usage: '!podatki',
    examples: ['!podatki'],
    cooldown: '3 sekundy',
    requirements: 'Brak.',
    aliases: ['tax', 'taxes'],
    additionalInfo: []
  }
];

function getHelpCommandById(id) {
  return helpCommands.find(command => command.id === id) || null;
}

function getHelpCommandByName(input) {
  const normalized = String(input || '').toLowerCase();

  return helpCommands.find(command => (
    command.name === normalized
    || command.aliases.some(alias => alias.toLowerCase() === normalized)
  )) || null;
}

function getTotalPages() {
  return Math.max(1, Math.ceil(helpCommands.length / HELP_PAGE_SIZE));
}

function paginateCommands(page) {
  const safePage = Math.min(Math.max(1, page), getTotalPages());
  const start = (safePage - 1) * HELP_PAGE_SIZE;
  const items = helpCommands.slice(start, start + HELP_PAGE_SIZE);

  return {
    page: safePage,
    totalPages: getTotalPages(),
    items
  };
}

function buildHelpShell() {
  return new EmbedBuilder()
    .setColor(config.embed.primary);
}

function buildHelpListEmbed(client) {
  const cols = 3;
  const lines = [];
  
  for (let i = 0; i < helpCommands.length; i += cols) {
    const rowCmds = helpCommands.slice(i, i + cols);
    const rowParts = rowCmds.map(c => {
      const numStr = String(c.id).padStart(2, ' ');
      const cmdStr = `!${c.name}`;
      return `${numStr}. ${cmdStr.padEnd(11, ' ')}`;
    });
    lines.push(rowParts.join(' '));
  }

  const gridText = lines.join('\n');

  return buildHelpShell()
    .setTitle('📖 SPIS KOMEND')
    .setDescription(
      `${gridText}\n\n` +
      `💡 Szczegóły: !help <numer/nazwa> (np. !help 2)`
    );
}

function buildHelpDetailEmbed(client, command) {
  return buildHelpShell()
    .setTitle(`Komenda: ${config.prefix}${command.name}`)
    .setDescription(command.description)
    .addFields(
      { name: 'Cooldown', value: command.cooldown, inline: true },
      { name: 'Skladnia', value: command.usage, inline: false },
      { name: 'Przyklady', value: command.examples.join('\n'), inline: false }
    );
}

function buildHelpErrorEmbed() {
  return buildHelpShell()
    .setTitle('Blad pomocy')
    .setDescription('Nie znaleziono komendy o tym numerze lub nazwie.');
}

function buildHelpButtons() {
  return [];
}

module.exports = {
  HELP_PAGE_SIZE,
  helpCommands,
  getHelpCommandById,
  getHelpCommandByName,
  buildHelpListEmbed,
  buildHelpDetailEmbed,
  buildHelpErrorEmbed,
  buildHelpButtons,
  getTotalPages
};
