const axios = require('axios');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'pogoda',
  aliases: ['weather', 'synoptyk'],
  async execute(client, message, args) {
    let city = args.join(' ').trim();

    if (args[0] && (args[0].toLowerCase() === 'domyslna' || args[0].toLowerCase() === 'domyślna')) {
      const newCity = args.slice(1).join(' ').trim();
      if (!newCity) {
        await message.reply('❌ Podaj nazwę miasta, które chcesz ustawić jako domyślne (np. **!pogoda domyslna Wrocław**).');
        return;
      }
      await withData(store => {
        const user = createUser(message.author.id, store.users);
        user.defaultCity = newCity;
      });
      await message.reply(`✅ Ustawiono **${newCity}** jako Twoje domyślne miasto pogody.`);
      return;
    }

    if (!city) {
      await withData(store => {
        const user = createUser(message.author.id, store.users);
        city = user.defaultCity || 'Warszawa';
      });
    }

    try {
      const response = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=%t|%C|%h|%w&lang=pl&m`);
      const data = response.data;

      if (data.includes('<html') || data.includes('<!DOCTYPE') || data.includes('Unknown location')) {
        await message.reply(`❌ Nie znaleziono lokalizacji: **${city}**.`);
        return;
      }

      const parts = data.split('|');
      if (parts.length < 4) {
        await message.reply('❌ Nie udało się pobrać danych pogodowych.');
        return;
      }

      const tempStr = parts[0].trim();
      const condition = parts[1].trim();
      const humidity = parts[2].trim();
      const wind = parts[3].trim();

      const responseText = 
        `🌦️ **Pogoda: ${city.charAt(0).toUpperCase() + city.slice(1)}**\n` +
        `🌡️ Temperatura: **${tempStr}**\n` +
        `☁️ Warunki: **${condition}**\n` +
        `💧 Wilgotność: **${humidity}**\n` +
        `💨 Wiatr: **${wind}**`;

      await message.reply(responseText);

    } catch (err) {
      console.error('[POGODA] Błąd:', err);
      await message.reply(`❌ Serwer pogodowy nie odpowiada.`);
    }
  }
};
