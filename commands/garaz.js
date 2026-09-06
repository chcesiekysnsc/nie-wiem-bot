const { formatCurrency, hasItem, ensureInventoryRecord } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const VEHICLES = [
  {
    id: 'skuter',
    name: '🛵 Skuter',
    price: 100000,
    desc: '-4% cooldown !work',
    workCdRed: 0.04,
    workBonus: 0,
    crimeCdRed: 0,
    crimeBonus: 0,
    robLootBonus: 0,
    firmaBonus: 0
  },
  {
    id: 'sedan',
    name: '🚗 Sedan',
    price: 350000,
    desc: '-6% cooldown !work, +4% zarobki !work',
    workCdRed: 0.06,
    workBonus: 0.04,
    crimeCdRed: 0,
    crimeBonus: 0,
    robLootBonus: 0,
    firmaBonus: 0
  },
  {
    id: 'sportowiec',
    name: '🏎️ Sportowiec',
    price: 800000,
    desc: '-8% cooldown !work i !crime, +5% zarobki z work i crime',
    workCdRed: 0.08,
    workBonus: 0.05,
    crimeCdRed: 0.08,
    crimeBonus: 0.05,
    robLootBonus: 0,
    firmaBonus: 0
  },
  {
    id: 'van',
    name: '🚐 Van',
    price: 500000,
    desc: '+10% łup z !rob, -6% cooldownu work, +5% zysku z work, +3% zysku z firm',
    workCdRed: 0.06,
    workBonus: 0.05,
    crimeCdRed: 0,
    crimeBonus: 0,
    robLootBonus: 0.10,
    firmaBonus: 0.03
  },
  {
    id: 'ciezarowka',
    name: '🚛 Ciężarówka',
    price: 1200000,
    desc: '+8% dochód z firm, -6% cd work i crime, +6% zarobku z work i crime',
    workCdRed: 0.06,
    workBonus: 0.06,
    crimeCdRed: 0.06,
    crimeBonus: 0.06,
    robLootBonus: 0,
    firmaBonus: 0.08
  }
];

const findVehicle = (query) => {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return null;

  const idx = parseInt(q, 10);
  if (!isNaN(idx) && idx >= 1 && idx <= VEHICLES.length) {
    return VEHICLES[idx - 1];
  }

  return VEHICLES.find(v => v.id === q || v.name.toLowerCase().includes(q));
};

module.exports = {
  name: 'garaz',
  aliases: ['garaż', 'garage', 'pojazd', 'pojazdy'],
  vehicles: VEHICLES,
  async execute(client, message, args) {
    const action = String(args[0] || '').toLowerCase();

    // Helper: render garage view / market catalog
    const renderGarageView = (userGaraz) => {
      let text = '🏎️ **GARAŻ I SALON POJAZDÓW**\n';
      text += 'Posiadanie pojazdu daje unikalne pasywne bonusy! (Maksymalnie 1 pojazd w garażu)\n\n';

      if (userGaraz && userGaraz.pojazdId) {
        const owned = VEHICLES.find(v => v.id === userGaraz.pojazdId);
        if (owned) {
          text += `🚗 **Twój obecny pojazd:** ${owned.name}\n`;
          text += `   ↳ Bonus: **${owned.desc}**\n`;
          text += `   ↳ Aby sprzedać pojazd za 50% ceny: **!garaz sprzedaj**\n\n`;
        }
      } else {
        text += `🚘 **Stan garażu:** Pusty (brak pojazdu)\n\n`;
      }

      text += '📋 **Oferta salonu samochodowego:**\n';
      VEHICLES.forEach((v, index) => {
        text += `**${index + 1}. ${v.name}**\n`;
        text += `   ↳ Cena: **${formatCurrency(v.price)}**\n`;
        text += `   ↳ Bonus: **${v.desc}**\n\n`;
      });

      text += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
      text += '💡 Kup pojazd: **!garaz kup <numer/nazwa>**\n';
      text += '💡 Sprzedaj obecny pojazd: **!garaz sprzedaj**';
      return text;
    };

    // Subcommand: KUP
    if (action === 'kup' || action === 'buy') {
      const targetQuery = args.slice(1).join(' ');
      if (!targetQuery) {
        await message.reply('❌ Podaj numer lub nazwę pojazdu! Przykład: **!garaz kup 1** lub **!garaz kup skuter**.');
        return;
      }

      const vehicle = findVehicle(targetQuery);
      if (!vehicle) {
        await message.reply('❌ Nie znaleziono takiego pojazdu! Wpisz **!garaz**, aby zobaczyć listę.');
        return;
      }

      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);

        if (!store.profiles) store.profiles = {};
        if (!store.profiles.garaz) store.profiles.garaz = {};

        const currentGaraz = store.profiles.garaz[message.author.id];
        if (currentGaraz && currentGaraz.pojazdId) {
          const currentVeh = VEHICLES.find(v => v.id === currentGaraz.pojazdId);
          const currentName = currentVeh ? currentVeh.name : 'Pojazd';
          return { error: `❌ Posiadasz już pojazd: **${currentName}**!\n💡 Możesz posiadać maksymalnie 1 pojazd. Aby kupić nowy, musisz najpierw sprzedać obecny (**!garaz sprzedaj**).` };
        }

        if (user.balance < vehicle.price) {
          return { error: `❌ Brak wystarczających środków! Cena to **${formatCurrency(vehicle.price)}**, a posiadasz **${formatCurrency(user.balance)}**.` };
        }

        user.balance -= vehicle.price;
        store.profiles.garaz[message.author.id] = {
          pojazdId: vehicle.id,
          boughtAt: Date.now()
        };

        return { success: true, vehicle, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🎉 Gratulacje! Zakupiono **${result.vehicle.name}** za **${formatCurrency(result.vehicle.price)}**!\n✨ Bonus pasywny: **${result.vehicle.desc}**\n💰 Pozostały stan konta: **${formatCurrency(result.balance)}**.`);
      return;
    }

    // Subcommand: SPRZEDAJ
    if (action === 'sprzedaj' || action === 'sell') {
      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);

        if (!store.profiles) store.profiles = {};
        if (!store.profiles.garaz) store.profiles.garaz = {};

        const currentGaraz = store.profiles.garaz[message.author.id];
        if (!currentGaraz || !currentGaraz.pojazdId) {
          return { error: '❌ Nie posiadasz żadnego pojazdu w garażu!' };
        }

        const vehicle = VEHICLES.find(v => v.id === currentGaraz.pojazdId);
        const refund = vehicle ? Math.floor(vehicle.price * 0.5) : 0;

        user.balance += refund;
        delete store.profiles.garaz[message.author.id];

        return { success: true, vehicleName: vehicle ? vehicle.name : 'Pojazd', refund, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`💰 Sprzedano **${result.vehicleName}** za 50% wartości (**${formatCurrency(result.refund)}**).\n💳 Nowy stan konta: **${formatCurrency(result.balance)}**.`);
      return;
    }

    // Default action: Show Garage & Shop catalog
    const userGaraz = await withData(store => {
      if (!store.profiles) store.profiles = {};
      if (!store.profiles.garaz) store.profiles.garaz = {};
      return store.profiles.garaz[message.author.id] || null;
    });

    await message.reply(renderGarageView(userGaraz));
  }
};
