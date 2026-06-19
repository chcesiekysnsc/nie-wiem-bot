const config = require('../config/config');

const eventItems = {
  1: {
    id: 'szkarlatne_oko',
    name: 'Szkarłatne Oko Krupiera',
    emoji: '👁️',
    desc: 'Stałe +1.5% szansy na wygraną w blackjacku, slots, ruletce, bet i coinflip. Stackuje się z innymi odznakami.',
    award: 'TOP 1 sezonu (stary)'
  },
  2: {
    id: 'cien_nocy',
    name: 'Cień Nocy',
    emoji: '🥷',
    desc: 'Skraca cooldown na okradanie (!rob) o 25%. Stackuje się z innymi bonusami.',
    award: 'TOP 2 sezonu (stary)'
  },
  3: {
    id: 'wampirzy_sztylet',
    name: 'Wampirzy Sztylet',
    emoji: '🩸',
    desc: 'Udany rob resetuje cooldowny komend !work oraz !crime i kradnie dodatkowe 5% portfela ofiary.',
    award: 'TOP 3 sezonu (stary)'
  },
  4: {
    id: 'szwajcarski_klucz',
    name: 'Szwajcarski Klucz',
    emoji: '🔑',
    desc: 'Zwiększa pojemność banku o 100 000 monet. Stackuje się z innymi bonusami.',
    award: 'TOP 4 sezonu (stary)'
  },
  5: {
    id: 'krysztal_doswiadczenia',
    name: 'Kryształ Doświadczenia',
    emoji: '🔮',
    desc: 'Zwiększa zdobywane XP ze wszystkich źródeł (work, crime, gry, czat) o 15%. Stackuje się z innymi bonusami.',
    award: 'TOP 5 sezonu (stary)'
  },
  6: {
    id: 'ananas_na_pizzy',
    name: 'Ananas na Pizzy',
    emoji: '🍕',
    desc: 'Stałe +2% szczęścia do wszystkich pozytywnych zdarzeń losowych w ekonomii (!blackjack, !slots, !coinflip, !ruletka, !bet, jackpoty, losowe eventy, skrzynki).',
    award: 'TOP 1 sezonu'
  },
  7: {
    id: 'czarna_bandera',
    name: 'Czarna Bandera',
    emoji: '🏴',
    desc: 'Po każdym udanym !rob istnieje 5% szansy na aktywację efektu „Drugi Napad” (dodatkowa kradzież bez cooldownu na tę samą osobę).',
    award: 'TOP 2 sezonu'
  },
  8: {
    id: 'czarna_karta',
    name: 'Czarna Karta Bankowa',
    emoji: '💳',
    desc: 'Co każde 6 godzin dopisuje do salda portfela dodatkowe 2% monet zdeponowanych w banku.',
    award: 'TOP 3 sezonu'
  },
  9: {
    id: 'kosci_oszusta',
    name: 'Kości Oszusta',
    emoji: '🎲',
    desc: 'Przy każdej przegranej w grach hazardowych istnieje 2% szansy na pełen zwrot postawionej stawki.',
    award: 'TOP 4 sezonu'
  },
  10: {
    id: 'czterolistna_moneta',
    name: 'Czterolistna Moneta',
    emoji: '🍀',
    desc: 'Wzmacnia o +1 punkt procentowy wszystkie posiadane pozytywne bonusy w grze (XP, odsetki, zyski z pracy/firm, szanse w kasynie/napadu, itp.).',
    award: 'TOP 5 sezonu'
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

      if (isNaN(nr) || !eventItems[nr]) {
        await message.reply(`❌ Podaj poprawny numer przedmiotu (1-10). Użyj: **!eventitemy ${subCommand} <nr> <@osoba/ID>**`);
        return;
      }

      let targetId = null;
      const mentioned = message.mentions.users.first();
      if (mentioned) {
        targetId = mentioned.id;
      } else if (args[2] && /^\d+$/.test(args[2])) {
        targetId = args[2];
      }

      if (!targetId) {
        await message.reply(`❌ Wskaż osobę (oznaczenie lub ID). Użyj: **!eventitemy ${subCommand} <nr> <@osoba/ID>**`);
        return;
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

    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Nie masz uprawnień do użycia tej komendy.');
      return;
    }

    const nr = Number(args[0]);
    if (!args[0]) {
      let msg = '🎁 **Lista permanentnych przedmiotów eventowych (sezonowych):**\n\n';
      for (const [key, item] of Object.entries(eventItems)) {
        msg += `${key}. ${item.emoji} **${item.name}** - *Nagroda za: ${item.award}*\n`;
      }
      msg += '\n💡 Wpisz **!eventitemy <nr>** aby zobaczyć szczegółowy opis.';
      await message.reply(msg);
      return;
    }

    if (isNaN(nr) || !eventItems[nr]) {
      await message.reply('❌ Podaj poprawny numer przedmiotu (1-10).');
      return;
    }

    const item = eventItems[nr];
    const detailMsg = `${item.emoji} **${item.name}** (ID: \`${item.id}\`)\n` +
                      `🏆 **Nagroda za**: ${item.award}\n` +
                      `ℹ️ **Opis działania**: ${item.desc}`;
    await message.reply(detailMsg);
  }
};
