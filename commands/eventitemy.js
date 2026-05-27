const config = require('../config/config');

const eventItems = {
  1: {
    id: 'szkarlatne_oko',
    name: 'Szkarłatne Oko Krupiera',
    emoji: '👁️',
    desc: 'Stałe +1.5% szansy na wygraną w blackjacku, slots, ruletce, bet i coinflip. Stackuje się z innymi odznakami.',
    award: 'TOP 1 sezonu'
  },
  2: {
    id: 'cien_nocy',
    name: 'Cień Nocy',
    emoji: '🥷',
    desc: 'Skraca cooldown na okradanie (!rob) o 25%. Stackuje się z innymi bonusami.',
    award: 'TOP 2 sezonu'
  },
  3: {
    id: 'wampirzy_sztylet',
    name: 'Wampirzy Sztylet',
    emoji: '🩸',
    desc: 'Udany rob resetuje cooldowny komend !work oraz !crime i kradnie dodatkowe 5% portfela ofiary.',
    award: 'TOP 3 sezonu'
  },
  4: {
    id: 'szwajcarski_klucz',
    name: 'Szwajcarski Klucz',
    emoji: '🔑',
    desc: 'Zwiększa pojemność banku o 100 000 monet. Stackuje się z innymi bonusami.',
    award: 'TOP 4 sezonu'
  },
  5: {
    id: 'krysztal_doswiadczenia',
    name: 'Kryształ Doświadczenia',
    emoji: '🔮',
    desc: 'Zwiększa zdobywane XP ze wszystkich źródeł (work, crime, gry, czat) o 15%. Stackuje się z innymi bonusami.',
    award: 'TOP 5 sezonu'
  }
};

module.exports = {
  name: 'eventitemy',
  aliases: [],
  eventItems,
  async execute(client, message, args) {
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
      await message.reply('❌ Podaj poprawny numer przedmiotu (1-5).');
      return;
    }

    const item = eventItems[nr];
    const detailMsg = `${item.emoji} **${item.name}** (ID: \`${item.id}\`)\n` +
                      `🏆 **Nagroda za**: ${item.award}\n` +
                      `ℹ️ **Opis działania**: ${item.desc}`;
    await message.reply(detailMsg);
  }
};
