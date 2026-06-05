const axios = require('axios');

module.exports = {
  name: 'pogoda',
  aliases: ['weather', 'synoptyk'],
  async execute(client, message, args) {
    const city = args.join(' ') || 'Warszawa';

    try {
      const response = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=%t|%C|%h|%w&lang=pl`);
      const data = response.data;

      // Sprawdź czy wttr.in zwróciło stronę HTML (błąd wyszukiwania miasta)
      if (data.includes('<html') || data.includes('<!DOCTYPE') || data.includes('Unknown location')) {
        await message.reply(`❌ Nie ma takiego miasta jak: **${city}**. Zmyśliłeś je.`);
        return;
      }

      const parts = data.split('|');
      if (parts.length < 4) {
        await message.reply('❌ Serwer wttr.in sypie błędami.');
        return;
      }

      const tempStr = parts[0].trim();
      const condition = parts[1].trim();
      const humidity = parts[2].trim();
      const wind = parts[3].trim();

      const tempNum = parseInt(tempStr.replace(/[^0-9-]/g, ''));

      let comment = '';
      if (isNaN(tempNum)) {
        comment = 'Coś poszło nie tak z temperaturą.';
      } else if (tempNum < -5) {
        comment = 'Syberia wjechała na pełnej. Zamrażalnik, zostań w domu.';
      } else if (tempNum < 5) {
        comment = 'Pizga złem. Bez grubej kurtki nawet nie podchodź.';
      } else if (tempNum < 15) {
        comment = 'Niby spoko, ale wiatr i tak zepsuje ci humor. Ubierz się na cebulę.';
      } else if (tempNum < 25) {
        comment = 'Znośnie. Idealny moment na udawanie, że masz życie towarzyskie.';
      } else if (tempNum < 32) {
        comment = 'Ciepło. Topisz się na samą myśl o wyjściu z piwnicy.';
      } else {
        comment = 'Piekło. Słońce próbuje nas zabić. Pij wodę i nie umieraj.';
      }

      const condLower = condition.toLowerCase();
      if (condLower.includes('deszcz') || condLower.includes('mżawka') || condLower.includes('ulewa')) {
        comment += ' Do tego leje. Klasyczna depresja, bierz parasol.';
      } else if (condLower.includes('śnieg') || condLower.includes('śnieżyca') || condLower.includes('grad')) {
        comment += ' I sypie białe gówno. Zima znowu zaskoczyła wszystkich.';
      } else if (condLower.includes('mgła') || condLower.includes('zamglenie')) {
        comment += ' Mgła jak w horrorze. Idealnie żeby zniknąć bez śladu.';
      } else if (condLower.includes('słonecznie') || condLower.includes('czyste niebo') || condLower.includes('jasno')) {
        comment += ' O dziwo świeci słońce. Wyjdź na chwilę do ludzi, zanim zniknie.';
      } else if (condLower.includes('pochmurno') || condLower.includes('chmury')) {
        comment += ' Szaro i ponuro. Idealna pogoda pod spanie.';
      } else if (condLower.includes('burza')) {
        comment += ' Napierdala burza. Wyłącz router z gniazdka i się módl.';
      }

      const responseText = 
        `🌦️ **Pogoda: ${city.charAt(0).toUpperCase() + city.slice(1)}**\n` +
        `🌡️ **${tempStr}** | **${condition}** *(wilgotność: ${humidity}, wiatr: ${wind})*\n\n` +
        `📢 *${comment}*`;

      await message.reply(responseText);

    } catch (err) {
      console.error('[POGODA] Błąd:', err);
      await message.reply(`❌ Serwer wttr.in leży i kwiczy.`);
    }
  }
};
