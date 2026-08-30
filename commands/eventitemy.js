const config = require('../config/config');

const eventItems = {
  1: {
    id: 'szkarlatne_oko',
    name: 'Szkarłatne Oko Krupiera',
    emoji: '👁️',
    desc: 'Stałe +1.5% szansy na wygraną w blackjacku, slots, ruletce, bet i coinflip. Stackuje się z innymi odznakami.',
    award: 'TOP 1 sezonu 1'
  },
  2: {
    id: 'cien_nocy',
    name: 'Cień Nocy',
    emoji: '🥷',
    desc: 'Skraca cooldown na okradanie (!rob) o 25%. Stackuje się z innymi bonusami.',
    award: 'TOP 2 sezonu 1'
  },
  3: {
    id: 'wampirzy_sztylet',
    name: 'Wampirzy Sztylet',
    emoji: '🩸',
    desc: 'Udany rob resetuje cooldowny komend !work oraz !crime i kradnie dodatkowe 5% portfela ofiary.',
    award: 'TOP 3 sezonu 1'
  },
  4: {
    id: 'szwajcarski_klucz',
    name: 'Szwajcarski Klucz',
    emoji: '🔑',
    desc: 'Zwiększa pojemność banku o 250 000 monet. Stackuje się z innymi bonusami.',
    award: 'TOP 4 sezonu 1'
  },
  5: {
    id: 'krysztal_doswiadczenia',
    name: 'Kryształ Doświadczenia',
    emoji: '🔮',
    desc: 'Zwiększa zdobywane XP ze wszystkich źródeł (work, crime, gry, czat) o 15%. Stackuje się z innymi bonusami.',
    award: 'TOP 5 sezonu 1'
  },
  6: {
    id: 'ananas_na_pizzy',
    name: 'Ananas na Pizzy',
    emoji: '🍕',
    desc: 'Stałe +2% szczęścia do wszystkich pozytywnych zdarzeń losowych w ekonomii (!blackjack, !slots, !coinflip, !ruletka, !bet, jackpoty, losowe eventy, skrzynki).',
    award: 'TOP 1 sezonu 2'
  },
  7: {
    id: 'czarna_bandera',
    name: 'Czarna Bandera',
    emoji: '🏴',
    desc: 'Po każdym udanym !rob istnieje 5% szansy na aktywację efektu „Drugi Napad” (dodatkowa kradzież bez cooldownu na tę samą osobę).',
    award: 'TOP 2 sezonu 2'
  },
  8: {
    id: 'kosci_oszusta',
    name: 'Kości Oszusta',
    emoji: '🎲',
    desc: 'Przy każdej przegranej w grach hazardowych istnieje 2% szansy na pełen zwrot postawionej stawki.',
    award: 'TOP 3 sezonu 2'
  },
  9: {
    id: 'czterolistna_moneta',
    name: 'Czterolistna Moneta',
    emoji: '🍀',
    desc: 'Wzmacnia o +1 punkt procentowy wszystkie posiadane pozytywne bonusy w grze (XP, odsetki, zyski z pracy/firm, szanse w kasynie/napadu, itp.).',
    award: 'TOP 4 sezonu 2'
  },
  10: {
    id: 'czarna_karta',
    name: 'Czarna Karta Bankowa',
    emoji: '💳',
    desc: 'Co każde 6 godzin dopisuje do salda portfela dodatkowe 10% monet zdeponowanych w banku.',
    award: 'TOP 5 sezonu 2'
  },
  11: {
    id: 'krolewskie_insygnia',
    name: 'Królewskie Insygnia',
    emoji: '👑',
    desc: 'Zwiększają zyski ze wszystkich źródeł (work, crime, daily, rob, firmy, kasyno, napady gangu, loteria itp.) o stałe 10%. Stackuje się z innymi bonusami.',
    award: 'TOP 1 sezonu 3'
  },
  12: {
    id: 'szwajcarski_zegarek',
    name: 'Szwajcarski Zegarek',
    emoji: '⌚',
    desc: 'Skraca cooldown na wszystkie komendy ekonomiczne (!work, !crime, !rob, !daily) o 15%. Stackuje się z innymi bonusami.',
    award: 'TOP 3 sezonu 3'
  },
  13: {
    id: 'licencja_monopolisty',
    name: 'Licencja Monopolisty',
    emoji: '🏢',
    desc: 'Pozwala posiadać drugą firmę jednocześnie. Druga firma musi być zawsze o jeden tier niższa niż pierwsza. Zarządzanie drugą firmą odbywa się przez komendy: !firma2 [kup <nr/ID> | sprzedaj | napraw | status]. Zysk z obu firm zbierasz komendą: !firma zbierz.',
    award: 'TOP 2 sezonu 3'
  },
  14: {
    id: 'ksiega_monopolisty',
    name: 'Księga Monopolisty',
    emoji: '📕',
    desc: 'Zwiększa zyski z Twojej firmy o 15% i zmniejsza szansę na awarię o 2 punkty procentowe.',
    award: 'TOP 4 sezonu 3'
  },
   15: {
     id: 'katalizator_bogactwa',
     name: 'Katalizator Bogactwa',
     emoji: '💎',
     desc: 'Podwaja bazowe oprocentowanie w banku (np. zamiast +2% co 6h/12h daje +4%). Stackuje się z innymi bonusami.',
     award: 'TOP 5 sezonu 3'
   },
     16: {
       id: 'deweloper',
       name: 'Deweloper',
       emoji: '🏗️',
       desc: 'Zmniejsza czynsz za dom o 50%. Możesz posiadać dwa domy (drugi dom musi być o jeden tier niższy). Domy są 15% tańsze. Bank ma dodatkowe 50k miejsca. Co opłatę czynszu masz 20% szansy, że najemca zapłaci czynsz za Ciebie i da Ci dodatkowe 75% wartości czynszu. Ulepszenia domów są tańsze o 15%. Bonus +10% do zarobków z !work, !crime oraz firm.',
       award: 'TOP 1 sezonu 4'
     },
     17: {
       id: 'eclipse',
       name: 'Eclipse',
       emoji: '🌑',
       desc: 'Masz 25% więcej siły w wojnach gangowych. Dostajesz 15% więcej z wojen gangowych i skoków gangu. Szansa na sukces w okradzeniu Ciebie spada o 5%. Masz dodatkowe 60k miejsca w banku.',
       award: 'TOP 2 sezonu 4'
     },
     18: {
       id: 'mark_of_sacrifice',
       name: 'Mark of Sacrifice',
       emoji: '🎭',
       desc: 'Gdy podczas pojedynczego !bet stracisz ponad 50% swojego salda, odzyskujesz 10% tego co straciłeś oraz masz 5% na to, że otrzymasz dodatkowe 10%. Otrzymujesz również 65k miejsca w banku. Masz 2% szansy na uratowanie się przed przegraną w !ruletka i !blackjack.',
       award: 'TOP 3 sezonu 4'
     },
     19: {
       id: 'polityk',
       name: 'Polityk',
       emoji: '🎩',
       desc: 'Masz 5% szansy na ominięcie podatków. Pracownicy i ochroniarze pobierają 15% mniej wynagrodzenia. Masz 5% mniejszą szansę na przyłapanie w !crime i dostajesz 10% więcej z !crime. Otrzymujesz 2% więcej odsetek w banku. Pracownicy mają 4% większą szansę na dodatkowe pozytywne efekty (podwójna wypłata, natychmiastowa naprawa). Jeśli firma ulegnie awarii, masz 3% szansy na automatyczną naprawę bez kosztów.',
       award: 'TOP 4 sezonu 4'
     },
     20: {
       id: 'nether_blade',
       name: 'Nether Blade',
       emoji: '⚔️',
       desc: 'Gdy ktoś Cię okrada, masz 15% na to, że to Ty go okradniesz (100% na sukces, omijasz wszystkie zabezpieczenia) i okradasz go z jego bonusów 10%. Masz 15% na to, że ukradniesz mu jakiś przedmiot z ekwipunku. Szansa na sukces osoby, która Cię okrada, jest zmniejszona o 5%.',
       award: 'TOP 5 sezonu 4'
     }
 };

module.exports = {
  name: 'eventitemy',
  aliases: [],
  eventItems,
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    const subCommand = String(args[0] || '').toLowerCase();

    if (subCommand === 'add' || subCommand === 'del') {
      if (message.author.id !== creatorId) {
        await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
        return;
      }

      const nr = Number(args[1]);
      if (isNaN(nr) || !eventItems[nr]) {
        await message.reply(`❌ Podaj poprawny numer przedmiotu (1-20). Użyj: **!eventitemy ${subCommand} <nr> <@osoba/ID>**`);
        return;
      }

      let targetId = null;
      const mentioned = message.mentions.users.first();
      if (mentioned) {
        targetId = mentioned.id;
      } else if (args[2] && /^\d+$/.test(args[2])) {
        targetId = args[2];
      } else {
        targetId = message.author.id;
      }

      const { withData } = require('../utils/storage');
      const { ensureInventoryRecord, addItem, removeItem } = require('../utils/economy');
      const item = eventItems[nr];
      const targetName = client.userNames.get(targetId) || `Użytkownik_${targetId.slice(-6)}`;

      if (subCommand === 'add') {
        await withData(store => {
          const inv = ensureInventoryRecord(store.inventory, targetId);
          addItem(inv, item.id, 1);
        });
        await message.reply(`✅ Pomyślnie dodałeś przedmiot ${item.emoji} **${item.name}** użytkownikowi **${targetName}** (ID: ${targetId})!`);
      } else {
        const removed = await withData(store => {
          const inv = ensureInventoryRecord(store.inventory, targetId);
          return removeItem(inv, item.id, 1);
        });
        if (removed) {
          await message.reply(`✅ Pomyślnie usunąłeś przedmiot ${item.emoji} **${item.name}** użytkownikowi **${targetName}** (ID: ${targetId})!`);
        } else {
          await message.reply(`❌ Użytkownik **${targetName}** nie posiada przedmiotu ${item.emoji} **${item.name}**.`);
        }
      }
      return;
    }

    const nr = Number(args[0]);
    const isSeasonFilter = subCommand.startsWith('s') && !isNaN(parseInt(subCommand.slice(1), 10));

    if (!args[0] || isSeasonFilter) {
      let filterSeason = null;
      if (isSeasonFilter) {
        filterSeason = parseInt(subCommand.slice(1), 10);
      }

      let msg = filterSeason ? `🎁 **Lista przedmiotów z sezonu ${filterSeason}:**\n\n` : '🎁 **Lista permanentnych przedmiotów eventowych (sezonowych):**\n\n';
      let count = 0;

      for (const [key, item] of Object.entries(eventItems)) {
        if (filterSeason) {
          const regex = new RegExp(`sezonu?\\s*${filterSeason}\\b`, 'i');
          if (!regex.test(item.award)) {
            continue;
          }
        }
        msg += `${key}. ${item.emoji} **${item.name}** - *Nagroda za: ${item.award}*\n   ↳ *Działanie:* ${item.desc}\n\n`;
        count++;
      }

      if (count === 0 && filterSeason) {
        msg += `Brak przedmiotów przypisanych do sezonu ${filterSeason}.\n\n`;
      }

      msg += '💡 Wpisz **!eventitemy <nr>** aby zobaczyć szczegółowy opis.';
      await message.reply(msg);
      return;
    }

    if (isNaN(nr) || !eventItems[nr]) {
      await message.reply('❌ Podaj poprawny numer przedmiotu (1-20).');
      return;
    }

    const item = eventItems[nr];
    const detailMsg = `${item.emoji} **${item.name}** (ID: \`${item.id}\`)\n` +
                      `🏆 **Nagroda za**: ${item.award}\n` +
                      `ℹ️ **Opis działania**: ${item.desc}`;
    await message.reply(detailMsg);
  }
};
