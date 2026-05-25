const config = require('../config/config');
const { ensureInventoryRecord, hasItem } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const ARTEFAKTY_LIST = [
  {
    num: 1,
    id: 'krwawy_zeton',
    name: 'Krwawy Żeton',
    emoji: '🩸',
    rarity: 'Legendarny',
    shortDesc: '+6% szansa rob, +4% łup przy sukcesie, +8% kara przy wpadce.',
    longDesc: 'Legendarny pasywny przedmiot PvP. Zwiększa szansę powodzenia komendy !rob o 6%, a przy udanej kradzieży dodaje +4% do skradzionego łupu. Jeśli jednak zostaniesz przyłapany, kara za wpadkę rośnie o 8%. Efekty się nie stackują.',
    howToGet: 'Drop z wojen gangów (4% szansy dla zwycięzców) lub z Diamentowej Paczki (2% szansy).'
  },
  {
    num: 2,
    id: 'przekupiony_krupier',
    name: 'Przekupiony Krupier',
    emoji: '🧠',
    rarity: 'Legendarny',
    shortDesc: '3% szans na dobór korzystniejszej karty w blackjacku.',
    longDesc: 'Legendarny pasywny przedmiot hazardowy. W grze !blackjack daje 3% szans na to, że przy dobieraniu karty (hit/double) krupier da Ci bardziej korzystną kartę (dokonując cichej podmiany, jeśli karta z góry talii uratuje Cię przed bustem lub da wyższą wartość). Efekty się nie stackują.',
    howToGet: 'Drop z Tytanowej Paczki (2% szansy).'
  },
  {
    num: 3,
    id: 'zlota_karta',
    name: 'Złota Karta',
    emoji: '💳',
    rarity: 'Epicki',
    shortDesc: '+50 000 pojemności w banku.',
    longDesc: 'Epicki pasywny przedmiot. Zwiększa limit pojemności Twojego konta bankowego o dodatkowe 50 000 viccoinów. Efekty się nie stackują.',
    howToGet: 'Drop ze Złotej Paczki (2% szansy).'
  },
  {
    num: 4,
    id: 'stary_zegar',
    name: 'Stary Zegar',
    emoji: '⏰',
    rarity: 'Legendarny',
    shortDesc: '-10% cooldownu na komendy !work oraz !crime.',
    longDesc: 'Legendarny pasywny przedmiot użytkowy. Skraca czas oczekiwania (cooldown) na wykonanie komend !work oraz !crime o 10%. Efekty się nie stackują.',
    howToGet: 'Drop z Diamentowej Paczki (0.5% szansy).'
  },
  {
    num: 5,
    id: 'kamera',
    name: 'Kamera',
    emoji: '📷',
    rarity: 'Legendarny',
    shortDesc: '+5% więcej z kary dla złodzieja gdy ten wpadnie.',
    longDesc: 'Legendarny pasywny przedmiot obronny. Jeśli inny gracz spróbuje Cię okraść (!rob) i zostanie złapany przez policję, otrzymujesz dodatkowo bonusowe 5% wartości kary, którą zapłaci złodziej. Efekty się nie stackują.',
    howToGet: 'Drop ze Złotej Paczki (1% szansy).'
  }
];

module.exports = {
  name: 'artefakty',
  aliases: ['artf', 'artefakt'],
  async execute(client, message, args) {
    const userId = message.author.id;

    if (args[0] === 'help' || args[0] === 'info') {
      const numParam = parseInt(args[1], 10);
      const art = ARTEFAKTY_LIST.find(a => a.num === numParam);

      if (!art) {
        await message.reply('❌ Nie znaleziono artefaktu o takim numerze. Użyj: **!artefakty** aby zobaczyć listę (1-5).');
        return;
      }

      const ownedStatus = await withData(store => {
        const inv = ensureInventoryRecord(store.inventory, userId);
        const qty = inv[art.id] || 0;
        return qty > 0 ? `🟢 Posiadasz (sztuk: ${qty})` : '🔴 Nie posiadasz';
      });

      const response = 
        `✨ **ARTEFAKT: ${art.name.toUpperCase()}** ${art.emoji} ✨\n` +
        `• **Rzadkość:** ${art.rarity}\n` +
        `• **Status:** ${ownedStatus}\n\n` +
        `ℹ️ **Opis działania:**\n${art.longDesc}\n\n` +
        `🔍 **Jak zdobyć:**\n${art.howToGet}`;

      await message.reply(response);
      return;
    }

    // List all artifacts
    const result = await withData(store => {
      const inv = ensureInventoryRecord(store.inventory, userId);
      return ARTEFAKTY_LIST.map(art => {
        const qty = inv[art.id] || 0;
        const status = qty > 0 ? `🟢 *(${qty} szt.)*` : '🔴 *(brak)*';
        return `${art.num}. ${art.emoji} **${art.name}** — ${art.shortDesc} ${status}`;
      });
    });

    const response = 
      `✨ **Kolekcja Artefaktów** ✨\n` +
      `Oto potężne pasywne przedmioty, które możesz zdobyć z paczek lub aktywności:\n\n` +
      result.join('\n') + `\n\n` +
      `💡 Aby sprawdzić szczegóły danego artefaktu, wpisz: **!artefakty help <numer>**`;

    await message.reply(response);
  }
};
