const { EmbedBuilder } = require('./embeds');
const config = require('../config/config');

const HELP_PAGE_SIZE = 7;

const CATEGORY_META = {
  ECONOMY: { label: 'ECONOMY' },
  GAMBLING: { label: 'GAMBLING' },
  SOCIAL: { label: 'SOCIAL' },
  ADMIN: { label: 'ADMIN' }
};

const helpCommands = [
  {
    id: 1,
    name: 'bal',
    category: 'ECONOMY',
    shortDescription: 'pokazuje saldo',
    description: 'Pokazuje stan portfela, banku, net worth oraz podstawowe statystyki konta.',
    usage: '!bal [uid]',
    examples: ['!bal', '!bal 1234567890123456'],
    cooldown: '2 sekundy',
    requirements: 'Brak. Konto tworzy sie automatycznie przy pierwszym uzyciu.',
    aliases: ['balance'],
    additionalInfo: [
      'Mozesz sprawdzic swoje saldo albo saldo innego gracza po UID z Messengera.',
      'W odpowiedzi zobaczysz portfel, bank, level i prestige.'
    ]
  },
  {
    id: 2,
    name: 'daily',
    category: 'ECONOMY',
    shortDescription: 'odbierz dzienna nagrode',
    description: 'Odbiera codzienna nagrode coins i daje dodatkowe XP za aktywnosc.',
    usage: '!daily',
    examples: ['!daily'],
    cooldown: '5 sekund komendowego cooldownu, nagroda co 24h',
    requirements: 'Musisz odczekac 24 godziny od poprzedniego claimu.',
    aliases: [],
    additionalInfo: [
      'VIP Pass zwieksza wysokosc daily.',
      'Komenda zapisuje czas kolejnego odbioru w users.json.'
    ]
  },
  {
    id: 3,
    name: 'work',
    category: 'ECONOMY',
    shortDescription: 'zarob coinsy pracujac',
    description: 'Losuje prace, przyznaje coins i daje XP za regularne zarabianie.',
    usage: '!work',
    examples: ['!work'],
    cooldown: '10 sekund',
    requirements: 'Brak wymagan poza cooldownem.',
    aliases: [],
    additionalInfo: [
      'VIP Pass daje bonus do wyplat z pracy.',
      'Komenda moze wbic level i dodac bonusowe coins za awans.'
    ]
  },
  {
    id: 4,
    name: 'crime',
    category: 'ECONOMY',
    shortDescription: 'ryzykowna kradziez NPC',
    description: 'Ryzykowna akcja przeciw NPC. Mozesz wygrac sporo coins albo zaplacic kare.',
    usage: '!crime',
    examples: ['!crime'],
    cooldown: '12 sekund',
    requirements: 'Brak wymagan poza cooldownem i odrobina odwagi.',
    aliases: [],
    additionalInfo: [
      'Wynik zalezy od szansy sukcesu ustawionej w configu.',
      'Przegrana odejmuje coins tylko z aktualnego portfela.'
    ]
  },
  {
    id: 5,
    name: 'rob',
    category: 'SOCIAL',
    shortDescription: 'okradnij gracza',
    description: 'Probujesz ukrasc coins innemu graczowi. Mozesz zgarnac lup albo zaplacic kare.',
    usage: '!rob <uid>',
    examples: ['!rob 1234567890123456'],
    cooldown: '20 sekund',
    requirements: 'Cel musi miec minimalna ilosc coins w portfelu. Nie mozna okrasc siebie.',
    aliases: [],
    additionalInfo: [
      'Rob Shield blokuje jedna udana probe kradziezy.',
      'Cel trzeba wskazac po Messenger UID.'
    ]
  },
  {
    id: 6,
    name: 'slots',
    category: 'GAMBLING',
    shortDescription: 'automaty kasynowe',
    description: 'Gra na automatach. Wrzucasz bet i liczysz na mnozniki za dobre symbole.',
    usage: '!slots kwota',
    examples: ['!slots 1000', '!slots all'],
    cooldown: '4 sekundy',
    requirements: 'Musisz miec wystarczajacy balance i zmiescic sie w max bet.',
    aliases: ['slot'],
    additionalInfo: [
      'Lucky Charm poprawia pule symboli.',
      'Rozne uklady daja rozne mnozniki wyplat.'
    ]
  },
  {
    id: 7,
    name: 'coinflip',
    category: 'GAMBLING',
    shortDescription: 'rzut moneta',
    description: 'Obstawiasz orla lub reszke i grasz o szybkie podwojenie stawki.',
    usage: '!coinflip kwota <orzel/reszka>',
    examples: ['!coinflip 1000 orzel', '!coinflip all reszka'],
    cooldown: '4 sekundy',
    requirements: 'Musisz podac poprawny wybor i miec balance na bet.',
    aliases: ['cf'],
    additionalInfo: [
      'Lucky Charm moze uratowac wybrane przegrane rundy.',
      'Zwyciestwo wyplaca x2 bet.'
    ]
  },
  {
    id: 8,
    name: 'roulette',
    category: 'GAMBLING',
    shortDescription: 'ruletka',
    description: 'Ruletka z typowaniem koloru, parzystosci albo konkretnego numeru.',
    usage: '!roulette kwota <red|black|green|even|odd|0-36>',
    examples: ['!roulette 1000 red', '!roulette all 17'],
    cooldown: '5 sekund',
    requirements: 'Musisz miec balance na bet i wybrac prawidlowy typ.',
    aliases: ['roul'],
    additionalInfo: [
      'Green i trafienie konkretnego numeru maja wyzsze mnozniki.',
      'Gra respektuje globalny max bet z configu.'
    ]
  },
  {
    id: 9,
    name: 'leaderboard',
    category: 'ECONOMY',
    shortDescription: 'top najbogatszych',
    description: 'Pokazuje top graczy posortowanych po balance od najbogatszych do najbiedniejszych.',
    usage: '!leaderboard',
    examples: ['!leaderboard'],
    cooldown: '8 sekund',
    requirements: 'Brak wymagan.',
    aliases: ['lb', 'top'],
    additionalInfo: [
      'Sortowanie odbywa sie po samym balance.',
      'Nazwy graczy pochodza z zapamietanych profili Messenger lub z UID.'
    ]
  },
  {
    id: 10,
    name: 'deposit',
    category: 'ECONOMY',
    shortDescription: 'wplac coinsy do banku',
    description: 'Przenosi coins z portfela do banku i pilnuje limitu pojemnosci.',
    usage: '!deposit kwota',
    examples: ['!deposit 1000', '!deposit all'],
    cooldown: '3 sekundy',
    requirements: 'Musisz miec coins w portfelu i wolne miejsce w banku.',
    aliases: ['dep'],
    additionalInfo: [
      'VIP i Golden Card zwiekszaja pojemnosc banku.',
      'Komenda obsluguje all i max.'
    ]
  },
  {
    id: 11,
    name: 'withdraw',
    category: 'ECONOMY',
    shortDescription: 'wyplac coinsy z banku',
    description: 'Przenosi wybrana kwote z banku do portfela.',
    usage: '!withdraw kwota',
    examples: ['!withdraw 5000', '!withdraw all'],
    cooldown: '3 sekundy',
    requirements: 'Musisz miec wystarczajaca ilosc coins w banku.',
    aliases: ['with'],
    additionalInfo: [
      'Obsluguje all i max.',
      'Daje niewielki bonus XP za korzystanie z banku.'
    ]
  },
  {
    id: 12,
    name: 'shop',
    category: 'ECONOMY',
    shortDescription: 'sklep kasynowy',
    description: 'Pokazuje liste przedmiotow albo pozwala kupic itemy za coins.',
    usage: '!shop [buy itemId ilosc]',
    examples: ['!shop', '!shop buy vip', '!shop buy luckycharm 3'],
    cooldown: '3 sekundy',
    requirements: 'Przy zakupie musisz miec wystarczajacy balance.',
    aliases: ['store'],
    additionalInfo: [
      'Sklep rozroznia itemy permanent i stackable.',
      'Zakup aktualizuje inventory.json.'
    ]
  },
  {
    id: 13,
    name: 'inventory',
    category: 'ECONOMY',
    shortDescription: 'twoj ekwipunek',
    description: 'Pokazuje wszystkie posiadane itemy, badges i aktualna pojemnosc banku.',
    usage: '!inventory [uid]',
    examples: ['!inventory', '!inventory 1234567890123456'],
    cooldown: '3 sekundy',
    requirements: 'Brak wymagan.',
    aliases: ['inv'],
    additionalInfo: [
      'Mozesz podejrzec inventory innego gracza po UID.',
      'Komenda pokazuje tez aktywne badges.'
    ]
  },
  {
    id: 14,
    name: 'marry',
    category: 'SOCIAL',
    shortDescription: 'slub z graczem',
    description: 'System oswiadczyn i slubu z akceptacja lub odrzuceniem po stronie drugiego gracza.',
    usage: '!marry <uid> | !marry accept <uid> | !marry decline <uid>',
    examples: ['!marry 1234567890123456', '!marry accept 1234567890123456'],
    cooldown: '12 sekund',
    requirements: 'Obie osoby musza byc wolne. Nie mozna poslubic samego siebie.',
    aliases: ['slub'],
    additionalInfo: [
      'Prosba wygasa po 2 minutach.',
      'Drugi gracz akceptuje wpisujac komende z UID proponujacego.'
    ]
  },
  {
    id: 15,
    name: 'pfp',
    category: 'SOCIAL',
    shortDescription: 'profil kasynowy',
    description: 'Pokazuje rozbudowany profil gracza ze statystykami i badges.',
    usage: '!pfp [uid]',
    examples: ['!pfp', '!pfp 1234567890123456'],
    cooldown: '4 sekundy',
    requirements: 'Brak wymagan.',
    aliases: ['profile'],
    additionalInfo: [
      'Mozesz podejrzec profil innego gracza po UID.',
      'Odpowiedz pokazuje balance, bank, level, xp, games played, total won, total lost i badges.'
    ]
  },
  {
    id: 16,
    name: 'admadd',
    category: 'ADMIN',
    shortDescription: 'dodaj coinsy adminem',
    description: 'Admin command do dodawania coins wskazanemu graczowi wraz z logowaniem akcji.',
    usage: '!admadd <uid> kwota',
    examples: ['!admadd 1234567890123456 50000'],
    cooldown: '2 sekundy',
    requirements: 'Tylko ID z config.admins moze uzyc tej komendy.',
    aliases: ['addmoney'],
    additionalInfo: [
      'Zmiana salda trafia do users.json i logs.json.',
      'Jesli ustawisz logRecipientId, bot wysle tam tekstowy log.'
    ]
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
    .setColor(config.embed.primary)
    .setFooter({ text: `${config.casinoName} | Messenger Help` })
    .setTimestamp();
}

function buildHelpListEmbed(client, page = 1) {
  const { items, totalPages, page: safePage } = paginateCommands(page);
  const descriptionLines = items.map(command => (
    `${command.id}. ${config.prefix}${command.name} - ${command.shortDescription}`
  ));

  const categoryLine = Object.values(CATEGORY_META)
    .map(category => category.label)
    .join(' | ');

  return buildHelpShell()
    .setTitle('Centrum Pomocy')
    .setDescription(
      'Lista wszystkich dostepnych komend.\n'
      + `Uzyj ${config.prefix}help numer albo ${config.prefix}help nazwa, aby zobaczyc szczegoly.\n`
      + `Uzyj ${config.prefix}help page <numer>, aby zmienic strone.\n\n`
      + descriptionLines.join('\n')
    )
    .addFields(
      { name: 'Kategorie', value: categoryLine, inline: false },
      { name: 'Paginacja', value: `Strona ${safePage}/${totalPages}`, inline: true },
      { name: 'Liczba komend', value: String(helpCommands.length), inline: true }
    );
}

function buildHelpDetailEmbed(client, command) {
  const category = CATEGORY_META[command.category] || { label: command.category };

  return buildHelpShell()
    .setTitle(`Komenda: ${config.prefix}${command.name}`)
    .setDescription(command.description)
    .addFields(
      { name: 'Kategoria', value: category.label, inline: true },
      { name: 'Cooldown', value: command.cooldown, inline: true },
      { name: 'Wymagania', value: command.requirements, inline: false },
      { name: 'Skladnia', value: command.usage, inline: false },
      { name: 'Przyklady', value: command.examples.join('\n'), inline: false },
      { name: 'Aliasy', value: command.aliases.length ? command.aliases.join(', ') : 'Brak aliasow', inline: false },
      { name: 'Dodatkowe informacje', value: command.additionalInfo.join('\n'), inline: false }
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
