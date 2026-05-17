const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const config = require('../config/config');

const HELP_PAGE_SIZE = 7;

const CATEGORY_META = {
  ECONOMY: { emoji: '💰', label: 'ECONOMY' },
  GAMBLING: { emoji: '🎲', label: 'GAMBLING' },
  SOCIAL: { emoji: '💍', label: 'SOCIAL' },
  ADMIN: { emoji: '🛡️', label: 'ADMIN' }
};

const helpCommands = [
  {
    id: 1,
    name: 'bal',
    emoji: '💰',
    category: 'ECONOMY',
    shortDescription: 'pokazuje saldo',
    description: 'Pokazuje stan portfela, banku, net worth oraz podstawowe statystyki konta.',
    usage: '!bal [@user]',
    examples: ['!bal', '!bal @gracz'],
    cooldown: '2 sekundy',
    requirements: 'Brak. Konto tworzy sie automatycznie przy pierwszym uzyciu.',
    aliases: ['balance'],
    additionalInfo: [
      'Mozesz sprawdzic swoje saldo albo saldo oznaczonego gracza.',
      'Embed pokazuje portfel, bank, level i prestige.'
    ]
  },
  {
    id: 2,
    name: 'daily',
    emoji: '📅',
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
    emoji: '💼',
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
    emoji: '🕶️',
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
    emoji: '🥷',
    category: 'SOCIAL',
    shortDescription: 'okradnij gracza',
    description: 'Probujesz ukrasc coins innemu graczowi. Mozesz zgarnac lup albo zaplacic kare.',
    usage: '!rob @user',
    examples: ['!rob @gracz'],
    cooldown: '20 sekund',
    requirements: 'Cel musi miec minimalna ilosc coins w portfelu. Nie mozna okrasc siebie ani bota.',
    aliases: [],
    additionalInfo: [
      'Rob Shield blokuje jedna udana probe kradziezy.',
      'Komenda zmienia statystyki obu graczy i zapisuje wszystko w JSON.'
    ]
  },
  {
    id: 6,
    name: 'slots',
    emoji: '🎰',
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
    name: 'blackjack',
    emoji: '🎴',
    category: 'GAMBLING',
    shortDescription: 'blackjack przeciw botowi',
    description: 'Gra blackjack przeciw dealerowi bota. Celem jest zdobycie 21 punktow bez przekroczenia limitu.',
    usage: '!blackjack kwota',
    examples: ['!blackjack 1000', '!blackjack all'],
    cooldown: '10 sekund',
    requirements: 'Musisz miec odpowiedni balance na rozpoczecie rozdania.',
    aliases: ['bj'],
    additionalInfo: [
      'Mozesz uzywac hit, stand i double.',
      'Dealer ma wlasne AI i dobiera karty do minimum 17.',
      'Wygrana standardowo daje x2 coins.'
    ]
  },
  {
    id: 8,
    name: 'coinflip',
    emoji: '🪙',
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
    id: 9,
    name: 'roulette',
    emoji: '🎡',
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
    id: 10,
    name: 'leaderboard',
    emoji: '🏆',
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
      'Bot probuje pobrac tagi graczy z cache lub API Discorda.'
    ]
  },
  {
    id: 11,
    name: 'deposit',
    emoji: '🏦',
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
      'Komenda obsluguje `all` i `max`.'
    ]
  },
  {
    id: 12,
    name: 'withdraw',
    emoji: '💸',
    category: 'ECONOMY',
    shortDescription: 'wyplac coinsy z banku',
    description: 'Przenosi wybrana kwote z banku do portfela.',
    usage: '!withdraw kwota',
    examples: ['!withdraw 5000', '!withdraw all'],
    cooldown: '3 sekundy',
    requirements: 'Musisz miec wystarczajaca ilosc coins w banku.',
    aliases: ['with'],
    additionalInfo: [
      'Obsluguje `all` i `max`.',
      'Daje niewielki bonus XP za korzystanie z banku.'
    ]
  },
  {
    id: 13,
    name: 'shop',
    emoji: '🛒',
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
    id: 14,
    name: 'inventory',
    emoji: '🎒',
    category: 'ECONOMY',
    shortDescription: 'twoj ekwipunek',
    description: 'Pokazuje wszystkie posiadane itemy, badges i aktualna pojemnosc banku.',
    usage: '!inventory [@user]',
    examples: ['!inventory', '!inventory @gracz'],
    cooldown: '3 sekundy',
    requirements: 'Brak wymagan.',
    aliases: ['inv'],
    additionalInfo: [
      'Komenda pokazuje tez aktywne badges wynikajace z itemow i statystyk.',
      'Mozesz podejrzec inventory innego gracza.'
    ]
  },
  {
    id: 15,
    name: 'marry',
    emoji: '💍',
    category: 'SOCIAL',
    shortDescription: 'slub z graczem',
    description: 'System oswiadczyn i slubu z przyciskami akceptacji lub odrzucenia.',
    usage: '!marry @user',
    examples: ['!marry @gracz'],
    cooldown: '12 sekund',
    requirements: 'Obie osoby musza byc wolne. Nie mozna poslubic siebie ani bota.',
    aliases: ['slub'],
    additionalInfo: [
      'Prosba wygasa po 2 minutach.',
      'Po zaakceptowaniu obie osoby dostaja status married.'
    ]
  },
  {
    id: 16,
    name: 'pfp',
    emoji: '🖼️',
    category: 'SOCIAL',
    shortDescription: 'profil kasynowy',
    description: 'Pokazuje rozbudowany profil gracza z avatarem, statystykami i badges.',
    usage: '!pfp [@user]',
    examples: ['!pfp', '!pfp @gracz'],
    cooldown: '4 sekundy',
    requirements: 'Brak wymagan.',
    aliases: ['profile'],
    additionalInfo: [
      'Embed pokazuje avatar, balance, bank, level, xp, games played, total won, total lost, prestige i badges.',
      'Mozesz podejrzec profil innego gracza.'
    ]
  },
  {
    id: 17,
    name: 'admadd',
    emoji: '👑',
    category: 'ADMIN',
    shortDescription: 'dodaj coinsy adminem',
    description: 'Admin command do dodawania coins oznaczonemu graczowi wraz z logowaniem akcji.',
    usage: '!admadd @user kwota',
    examples: ['!admadd @gracz 50000'],
    cooldown: '2 sekundy',
    requirements: 'Tylko ID z config.admins moze uzyc tej komendy.',
    aliases: ['addmoney'],
    additionalInfo: [
      'Zmiana salda trafia do users.json i logs.json.',
      'Bot moze tez wyslac log embed na kanal administracyjny.'
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

function buildHelpShell(client) {
  const embed = new EmbedBuilder()
    .setColor(config.embed.primary)
    .setFooter({ text: `${config.casinoName} • Premium Help Center` })
    .setTimestamp();

  if (client.user) {
    embed.setThumbnail(client.user.displayAvatarURL({ size: 256 }));
  }

  return embed;
}

function buildHelpListEmbed(client, page = 1) {
  const { items, totalPages, page: safePage } = paginateCommands(page);
  const descriptionLines = items.map(command => (
    `**${command.id}.** \`${config.prefix}${command.name}\` — ${command.shortDescription}`
  ));

  const categoryLine = Object.values(CATEGORY_META)
    .map(category => `${category.emoji} **${category.label}**`)
    .join(' • ');

  return buildHelpShell(client)
    .setTitle('📚 Centrum Pomocy')
    .setDescription(
      'Lista wszystkich dostepnych komend.\n'
      + `Uzyj \`${config.prefix}help numer\` aby zobaczyc pelny opis komendy.\n\n`
      + descriptionLines.join('\n')
    )
    .addFields(
      { name: 'Kategorie', value: categoryLine, inline: false },
      { name: 'Paginacja', value: `Strona **${safePage}/${totalPages}**`, inline: true },
      { name: 'Liczba komend', value: `**${helpCommands.length}**`, inline: true }
    );
}

function buildHelpDetailEmbed(client, command) {
  const category = CATEGORY_META[command.category] || { emoji: '📦', label: command.category };

  return buildHelpShell(client)
    .setTitle(`${command.emoji} Komenda: ${config.prefix}${command.name}`)
    .setDescription(command.description)
    .addFields(
      { name: 'Kategoria', value: `${category.emoji} ${category.label}`, inline: true },
      { name: 'Cooldown', value: command.cooldown, inline: true },
      { name: 'Wymagania', value: command.requirements, inline: false },
      { name: 'Skladnia', value: `\`${command.usage}\``, inline: false },
      { name: 'Przyklady uzycia', value: command.examples.map(example => `\`${example}\``).join('\n'), inline: false },
      { name: 'Aliasy', value: command.aliases.length ? command.aliases.map(alias => `\`${alias}\``).join(', ') : 'Brak aliasow', inline: false },
      { name: 'Dodatkowe informacje', value: command.additionalInfo.map(line => `• ${line}`).join('\n'), inline: false }
    );
}

function buildHelpErrorEmbed(client) {
  return buildHelpShell(client)
    .setTitle('❌ Blad pomocy')
    .setDescription('❌ Nie znaleziono komendy o tym numerze.');
}

function buildHelpButtons(ownerId, page) {
  const totalPages = getTotalPages();
  const safePage = Math.min(Math.max(1, page), totalPages);

  if (totalPages <= 1) {
    return [];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`help:list:${ownerId}:${Math.max(1, safePage - 1)}`)
        .setLabel('Poprzednia')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 1),
      new ButtonBuilder()
        .setCustomId(`help:list:${ownerId}:${Math.min(totalPages, safePage + 1)}`)
        .setLabel('Nastepna')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(safePage >= totalPages)
    )
  ];
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
