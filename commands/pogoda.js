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
        await message.reply(`❌ Nie udało się znaleźć pogody dla miasta: **${city}**. Czy na pewno takie istnieje? 🗺️`);
        return;
      }

      const parts = data.split('|');
      if (parts.length < 4) {
        await message.reply('❌ Błąd podczas przetwarzania danych pogodowych z serwera.');
        return;
      }

      const tempStr = parts[0].trim();
      const condition = parts[1].trim();
      const humidity = parts[2].trim();
      const wind = parts[3].trim();

      // Wyciągnij samą liczbę temperatury
      const tempNum = parseInt(tempStr.replace(/[^0-9-]/g, ''));

      // 1. Dobierz opis temperatury
      let tempComment = '';
      if (isNaN(tempNum)) {
        tempComment = 'Temperatura jest tak dziwna, że bot zgłupiał.';
      } else if (tempNum < -5) {
        tempComment = '🥶 Syberia wjechała na pełnej! Bez kalesonów ani rusz, chyba że planujesz krioterapię na świeżym powietrzu.';
      } else if (tempNum < 5) {
        tempComment = '❄️ Zimno jak w psiarni. Ubierz czapkę, grubą kurtkę i przygotuj się na narzekanie na wszystko dookoła.';
      } else if (tempNum < 15) {
        tempComment = '🌬️ Niby nie ma mrozu, ale wiatr piździ tak, że i tak będziesz płakać. Ubierz się na tzw. cebulkę.';
      } else if (tempNum < 25) {
        tempComment = '⛅ Ludzkie warunki! Można wyjść w samej bluzie i udawać przed znajomymi, że jest się wysportowanym.';
      } else if (tempNum < 32) {
        tempComment = '🥵 Gorąco. Zaczynasz się pocić na samą myśl o wyjściu do sklepu. Czas na zimny napój i wiatrak ustawiony na maksimum.';
      } else {
        tempComment = '🔥 PIEKŁO! Asfalt się topi, ptaki chodzą na piechotę. Jeśli wyjdziesz z piwnicy, zostaniesz chrupiącą frytką.';
      }

      // 2. Dobierz opis zjawiska pogodowego (warunku)
      let conditionComment = 'Pogoda stabilna, jak Twoje finanse u bota.';
      const condLower = condition.toLowerCase();

      if (condLower.includes('deszcz') || condLower.includes('mżawka') || condLower.includes('ulewa')) {
        conditionComment = '🌧️ Deszcz pada. Bierz parasol, chyba że lubisz zapach mokrego psa i zniszczone buty.';
      } else if (condLower.includes('śnieg') || condLower.includes('śnieżyca') || condLower.includes('grad')) {
        conditionComment = '❄️ Sypie białe gówno. Zima znowu zaskoczyła drogowców, a Ciebie zaraz zaskoczy odmrażanie szyb.';
      } else if (condLower.includes('mgła') || condLower.includes('zamglenie')) {
        conditionComment = '🌫️ Mgła jak w Silent Hill. Idealny moment na nagły atak potworów albo zgubienie drogi do domu.';
      } else if (condLower.includes('słonecznie') || condLower.includes('czyste niebo') || condLower.includes('jasno')) {
        conditionComment = '☀️ Słońce świeci! Szybko wychodź z piwnicy naładować witaminę D, zanim znowu zrobi się ciemno.';
      } else if (condLower.includes('pochmurno') || condLower.includes('chmury')) {
        conditionComment = '☁️ Szaro, ponuro, depresyjnie. Klasyczna polska pogoda. Idealny dzień, żeby leżeć w łóżku i grać w blackjacka u bota.';
      } else if (condLower.includes('burza')) {
        conditionComment = '⚡ Grzmi i błyska! Wyłącz router z gniazdka, schowaj się pod kołdrę i udawaj, że Cię nie ma.';
      }

      const responseText = 
        `🌦️ **HUMORYSTYCZNY SYNOPTYK: ${city.toUpperCase()}** 🌦️\n\n` +
        `🌡️ Temperatura: **${tempStr}**\n` +
        `☁️ Stan nieba: **${condition}**\n` +
        `💧 Wilgotność: **${humidity}**\n` +
        `💨 Wiatr: **${wind}**\n\n` +
        `📢 **Komentarz synoptyka:**\n` +
        `• ${tempComment}\n` +
        `• ${conditionComment}\n\n` +
        `👉 *Prognoza dostarczona przez satelity szpiegowskie bota.*`;

      await message.reply(responseText);

    } catch (err) {
      console.error('[POGODA] Błąd podczas pobierania pogody:', err);
      await message.reply(`❌ Nie udało się pobrać pogody dla miasta **${city}**. Serwer synoptyczny wttr.in leży i kwiczy.`);
    }
  }
};
