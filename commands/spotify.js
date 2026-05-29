const https = require('https');
const config = require('../config/config');
const spotify = require('../utils/spotify');

// Pomocnicza funkcja do wyszukiwania wideo na YouTube
function searchYouTube(query) {
  return new Promise((resolve, reject) => {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const videoIdRegex = /"videoId":"([a-zA-Z0-9_-]{11})"/;
        const match = data.match(videoIdRegex);
        if (match && match[1]) {
          return resolve(match[1]);
        }
        const watchRegex = /\/watch\?v=([a-zA-Z0-9_-]{11})/;
        const match2 = data.match(watchRegex);
        if (match2 && match2[1]) {
          return resolve(match2[1]);
        }
        reject(new Error('Brak wyników wyszukiwania na YouTube.'));
      });
    }).on('error', reject);
  });
}

// Pomocnicza funkcja do parsowania parametrów i odnajdowania celu (tag/ID)
function resolveTargetUser(message, args) {
  const mentioned = message.mentions.users.first();
  if (mentioned) {
    const cleanedArgs = args.filter(a => !a.startsWith('@'));
    return { id: mentioned.id, name: mentioned.username, cleanedArgs };
  }
  
  // Szukamy ID numerycznego w argumentach
  for (let i = 0; i < args.length; i++) {
    if (/^\d{14,16}$/.test(args[i])) {
      const id = args[i];
      const name = `Użytkownik_${id.slice(-6)}`;
      const cleanedArgs = args.filter((_, idx) => idx !== i);
      return { id, name, cleanedArgs };
    }
  }
  
  return { id: message.author.id, name: message.author.username, cleanedArgs: args };
}

module.exports = {
  name: 'spotify',
  aliases: ['sp'],
  async execute(client, message, args) {
    if (!client.api) {
      await message.reply('❌ Brak połączenia z API Messengera.');
      return;
    }

    // Wyświetlanie pomocy, jeśli brak argumentów
    if (!args[0]) {
      const helpMsg = 
        `🎛️ **PRAWIDŁOWE UŻYCIE KOMENDY !spotify**\n\n` +
        `🔌 **!spotify polacz** • Umożliwia sparowanie konta Spotify\n` +
        `🔥 **!spotify odlacz** • Rozłącza Twoje konto Spotify od bota\n` +
        `🤠 **!spotify profil <@użytkownik>** • Wyświetla informacje o profilu Spotify\n` +
        `🧐 **!spotify grupa** • Pokazuje czego słuchają członkowie grupy\n` +
        `🎧 **!spotify aktualnie <@użytkownik>** • Sprawdza, co jest obecnie odtwarzane\n` +
        `⭐ **!spotify toputwory 1m/6m/12m <@użytkownik>** • Najchętniej słuchane utwory\n` +
        `🤩 **!spotify topartyści 1m/6m/12m <@użytkownik>** • Najchętniej słuchani artyści\n` +
        `🕰 **!spotify ostatnie <@użytkownik>** • Pokazuje historię ostatnio odtwarzanych utworów\n` +
        `🥸 **!spotify incognito on/off** • Przełącza widoczność Twoich statystyk dla innych\n` +
        `📋 **!spotify kolejka <utwór/@użytkownik>** • Dodaje utwór do Twojej kolejki odtwarzania\n` +
        `💿 **!spotify play <utwór/@użytkownik>** • Odtwarza wybrany utwór na Twoim koncie\n` +
        `🎶 **!spotify youtube <@użytkownik>** • Wyszukuje aktualny utwór na YouTube`;
      await message.reply(helpMsg);
      return;
    }

    const sub = args[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Normalizacja (polskie znaki)
    const subArgs = args.slice(1);

    // 1. POŁĄCZ
    if (sub === 'polacz') {
      if (!spotify.isConfigured()) {
        const setupInfo = 
          `⚠️ **Brak konfiguracji Spotify po stronie bota!** ⚠️\n\n` +
          `Aby włączyć funkcję integracji ze Spotify, administrator bota musi dodać do pliku \`.env\` następujące wpisy:\n` +
          `\`\`\`\n` +
          `SPOTIFY_CLIENT_ID=Twój_Client_ID\n` +
          `SPOTIFY_CLIENT_SECRET=Twój_Client_Secret\n` +
          `SPOTIFY_REDIRECT_URI=Adres_URL_przekierowania_bota/spotify/callback\n` +
          `\`\`\``;
        await message.reply(setupInfo);
        return;
      }

      const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
      let connectUrl;
      try {
        const parsed = new URL(redirectUri);
        connectUrl = `${parsed.protocol}//${parsed.host}/spotify/connect?user=${message.author.id}`;
      } catch (_) {
        connectUrl = spotify.getAuthUrl(message.author.id); // Fallback do bezpośredniego linku Spotify
      }

      await message.reply(`🔌 **POŁĄCZENIE KONTĄ SPOTIFY**\n\nOto Twój indywidualny link do połączenia konta Spotify z botem:\n👉 ${connectUrl}\n\n*Po zalogowaniu i zaakceptowaniu uprawnień powrócisz tutaj.*`);
      return;
    }

    // 2. ODŁĄCZ
    if (sub === 'odlacz') {
      const success = spotify.disconnectUser(message.author.id);
      if (success) {
        await message.reply('🔥 Pomyślnie odłączono Twoje konto Spotify i usunięto Twoje dane autoryzacyjne.');
      } else {
        await message.reply('ℹ️ Twoje konto nie było połączone ze Spotify.');
      }
      return;
    }

    // 3. INCOGNITO
    if (sub === 'incognito') {
      if (!subArgs[0]) {
        const current = spotify.isIncognito(message.author.id);
        await message.reply(`🥸 Twój tryb incognito jest obecnie: **${current ? 'WŁĄCZONY 🟢' : 'WYŁĄCZONY 🔴'}**.\nWpisz \`!spotify incognito on\` lub \`off\` aby to zmienić.`);
        return;
      }
      const val = subArgs[0].toLowerCase();
      if (val === 'on' || val === 'wlaczone' || val === 'wlacz') {
        spotify.setIncognito(message.author.id, true);
        await message.reply('🥸 **Włączono tryb incognito.** Inni członkowie grupy nie mogą już sprawdzać tego, czego słuchasz.');
      } else if (val === 'off' || val === 'wylaczone' || val === 'wylacz') {
        spotify.setIncognito(message.author.id, false);
        await message.reply('🥸 **Wyłączono tryb incognito.** Twoje statystyki i aktualnie słuchany utwór są widoczne dla grupy.');
      } else {
        await message.reply('❌ Nieprawidłowy parametr. Wpisz `!spotify incognito on` lub `off`.');
      }
      return;
    }

    // Pozostałe podkomendy wymagają połączenia Spotify (lub sprawdzamy inne konto, które musi być połączone)
    // Zidentyfikujmy cel zapytania
    const target = resolveTargetUser(message, subArgs);
    const isSelf = target.id === message.author.id;

    // Sprawdź czy cel ma włączone incognito i nie jest to ta sama osoba
    if (!isSelf && spotify.isIncognito(target.id)) {
      await message.reply('🥸 Ten użytkownik włączył tryb incognito i nie zezwala na podgląd swoich statystyk Spotify.');
      return;
    }

    // Helper do formatowania milisekund do m:ss
    const formatMs = ms => {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(0);
      return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    try {
      // 4. PROFIL
      if (sub === 'profil') {
        const profile = await spotify.getProfile(target.id);
        const name = profile.display_name || target.name;
        const followers = profile.followers?.total || 0;
        const product = profile.product || 'free';
        const country = profile.country || 'PL';
        const url = profile.external_urls?.spotify || 'Brak linku';

        const profileMsg = 
          `🤠 **PROFIL SPOTIFY - ${name.toUpperCase()}**\n\n` +
          `👤 Nazwa wyświetlana: **${name}**\n` +
          `🌍 Kraj: **${country}**\n` +
          `💎 Subskrypcja: **${product.toUpperCase()}**\n` +
          `👥 Obserwujący: **${followers}**\n` +
          `🔗 Link do profilu: ${url}`;
        await message.reply(profileMsg);
        return;
      }

      // 5. AKTUALNIE
      if (sub === 'aktualnie') {
        const currently = await spotify.getCurrentlyPlaying(target.id);
        if (!currently || !currently.item) {
          await message.reply(isSelf ? '🎧 Nie odtwarzasz obecnie żadnego utworu na swoim Spotify.' : `🎧 Użytkownik **${target.name}** nie odtwarza obecnie żadnego utworu.`);
          return;
        }

        const track = currently.item;
        const trackName = track.name;
        const artists = track.artists.map(a => a.name).join(', ');
        const album = track.album.name;
        const popularity = track.popularity || 0;
        const link = track.external_urls?.spotify || '';

        // Pasek postępu
        const progressMs = currently.progress_ms || 0;
        const durationMs = track.duration_ms || 1;
        const barSize = 12;
        const percent = Math.min(1, progressMs / durationMs);
        const filled = Math.round(barSize * percent);
        const empty = barSize - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);

        const currentlyMsg = 
          `🎧 **AKTUALNIE ODTWARZANE - ${target.name.toUpperCase()}**\n\n` +
          `🎶 Utwór: **${trackName}**\n` +
          `👤 Wykonawca: **${artists}**\n` +
          `💿 Album: **${album}**\n` +
          `🔥 Popularność: **${popularity}/100**\n` +
          `⏱️ Postęp: \`[${bar}] ${formatMs(progressMs)} / ${formatMs(durationMs)}\`\n` +
          `🔗 Link: ${link}`;
        await message.reply(currentlyMsg);
        return;
      }

      // 6. TOP UTWORY
      if (sub === 'toputwory' || sub === 'toputwory') {
        // Sprawdź czy pierwszy parametr subArgs to zakres czasu (1m/6m/12m)
        let timeRange = '6m';
        if (target.cleanedArgs[0] && ['1m', '6m', '12m'].includes(target.cleanedArgs[0])) {
          timeRange = target.cleanedArgs[0];
        }

        const topTracks = await spotify.getTopTracks(target.id, timeRange);
        if (!topTracks || !topTracks.items || topTracks.items.length === 0) {
          await message.reply('❌ Nie znaleziono żadnych najczęściej słuchanych utworów w tym przedziale czasowym.');
          return;
        }

        const rangeLabel = timeRange === '1m' ? 'ostatni miesiąc' : (timeRange === '12m' ? 'ostatni rok' : 'ostatnie 6 miesięcy');
        let tracksList = `⭐ **TOP UTWORY - ${target.name.toUpperCase()} (${rangeLabel})**\n\n`;
        topTracks.items.forEach((item, index) => {
          const artists = item.artists.map(a => a.name).join(', ');
          tracksList += `${index + 1}. **${item.name}** — ${artists}\n`;
        });
        await message.reply(tracksList);
        return;
      }

      // 7. TOP ARTYŚCI
      if (sub === 'topartysci' || sub === 'topartysci') {
        let timeRange = '6m';
        if (target.cleanedArgs[0] && ['1m', '6m', '12m'].includes(target.cleanedArgs[0])) {
          timeRange = target.cleanedArgs[0];
        }

        const topArtists = await spotify.getTopArtists(target.id, timeRange);
        if (!topArtists || !topArtists.items || topArtists.items.length === 0) {
          await message.reply('❌ Nie znaleziono żadnych najczęściej słuchanych artystów w tym przedziale czasowym.');
          return;
        }

        const rangeLabel = timeRange === '1m' ? 'ostatni miesiąc' : (timeRange === '12m' ? 'ostatni rok' : 'ostatnie 6 miesięcy');
        let artistsList = `🤩 **TOP ARTYŚCI - ${target.name.toUpperCase()} (${rangeLabel})**\n\n`;
        topArtists.items.forEach((item, index) => {
          const genres = item.genres?.slice(0, 2).join(', ') || 'brak gatunku';
          artistsList += `${index + 1}. **${item.name}** [${genres}]\n`;
        });
        await message.reply(artistsList);
        return;
      }

      // 8. OSTATNIE
      if (sub === 'ostatnie') {
        const recently = await spotify.getRecentlyPlayed(target.id);
        if (!recently || !recently.items || recently.items.length === 0) {
          await message.reply('❌ Nie udało się pobrać historii ostatnio odtwarzanych utworów.');
          return;
        }

        let recentlyList = `🕰 **OSTATNIO SŁUCHANE - ${target.name.toUpperCase()}**\n\n`;
        recently.items.forEach((record, index) => {
          const track = record.track;
          const artists = track.artists.map(a => a.name).join(', ');
          recentlyList += `${index + 1}. **${track.name}** — ${artists}\n`;
        });
        await message.reply(recentlyList);
        return;
      }

      // 9. GRUPA
      if (sub === 'grupa') {
        // Pobierz listę uczestników czatu
        const threadInfo = await new Promise((resolve, reject) => {
          client.api.getThreadInfo(threadId, (err, ret) => {
            if (err) return reject(err);
            resolve(ret);
          });
        });

        if (!threadInfo || !threadInfo.participantIDs || threadInfo.participantIDs.length === 0) {
          await message.reply('❌ Nie udało się pobrać członków grupy.');
          return;
        }

        const participants = threadInfo.participantIDs;
        const db = spotify.loadSpotifyDb();
        const promises = [];

        for (const pId of participants) {
          // Jeśli jest w bazie Spotify i nie jest incognito
          if (db.users[pId] && !db.users[pId].incognito) {
            promises.push((async () => {
              try {
                const username = await client.resolveUserName(client.api, pId);
                const currently = await spotify.getCurrentlyPlaying(pId);
                if (currently && currently.item) {
                  const track = currently.item;
                  const artists = track.artists.map(a => a.name).join(', ');
                  return `👤 **${username}** słucha: **${track.name}** — ${artists}`;
                }
              } catch (_) {}
              return null;
            })());
          }
        }

        const activeList = (await Promise.all(promises)).filter(Boolean);
        if (activeList.length === 0) {
          await message.reply('🧐 Nikt z połączonych członków grupy nie odtwarza obecnie niczego na Spotify (lub ich statystyki są ukryte).');
          return;
        }

        const groupMsg = `🧐 **CZEGO SŁUCHA GRUPA?**\n\n${activeList.join('\n')}`;
        await message.reply(groupMsg);
        return;
      }

      // 10. KOLEJKA
      if (sub === 'kolejka') {
        const queryText = target.cleanedArgs.join(' ').trim();
        if (!queryText) {
          await message.reply('❌ Podaj nazwę utworu lub oznacz osobę, której piosenkę chcesz dodać do kolejki: **!spotify kolejka <nazwa/@osoba>**');
          return;
        }

        let trackUri = null;
        let trackDetails = '';

        // Jeśli w argumencie oznaczono inną osobę, ściągamy jej piosenkę
        const otherUser = resolveTargetUser(message, subArgs);
        if (otherUser.id !== message.author.id) {
          if (spotify.isIncognito(otherUser.id)) {
            await message.reply('🥸 Użytkownik ma włączone incognito — nie można skopiować jego odtwarzania.');
            return;
          }
          const currently = await spotify.getCurrentlyPlaying(otherUser.id);
          if (!currently || !currently.item) {
            await message.reply(`❌ Użytkownik **${otherUser.name}** nie odtwarza obecnie niczego na Spotify.`);
            return;
          }
          trackUri = currently.item.uri;
          trackDetails = `**${currently.item.name}** — ${currently.item.artists.map(a => a.name).join(', ')}`;
        } else {
          // W przeciwnym wypadku traktujemy jako wyszukiwanie
          const foundTrack = await spotify.searchTrack(message.author.id, queryText);
          if (!foundTrack) {
            await message.reply(`❌ Nie znaleziono utworu o nazwie "${queryText}" w katalogu Spotify.`);
            return;
          }
          trackUri = foundTrack.uri;
          trackDetails = `**${foundTrack.name}** — ${foundTrack.artists.map(a => a.name).join(', ')}`;
        }

        if (trackUri) {
          await spotify.addToQueue(message.author.id, trackUri);
          await message.reply(`📋 Pomyślnie dodano do Twojej kolejki Spotify: ${trackDetails}`);
        }
        return;
      }

      // 11. PLAY
      if (sub === 'play') {
        const queryText = target.cleanedArgs.join(' ').trim();
        if (!queryText) {
          await message.reply('❌ Podaj nazwę utworu lub oznacz osobę, której piosenkę chcesz odtworzyć: **!spotify play <nazwa/@osoba>**');
          return;
        }

        let trackUri = null;
        let trackDetails = '';

        // Jeśli w argumencie oznaczono inną osobę, ściągamy jej piosenkę
        const otherUser = resolveTargetUser(message, subArgs);
        if (otherUser.id !== message.author.id) {
          if (spotify.isIncognito(otherUser.id)) {
            await message.reply('🥸 Użytkownik ma włączone incognito — nie można skopiować jego odtwarzania.');
            return;
          }
          const currently = await spotify.getCurrentlyPlaying(otherUser.id);
          if (!currently || !currently.item) {
            await message.reply(`❌ Użytkownik **${otherUser.name}** nie odtwarza obecnie niczego na Spotify.`);
            return;
          }
          trackUri = currently.item.uri;
          trackDetails = `**${currently.item.name}** — ${currently.item.artists.map(a => a.name).join(', ')}`;
        } else {
          // W przeciwnym wypadku traktujemy jako wyszukiwanie
          const foundTrack = await spotify.searchTrack(message.author.id, queryText);
          if (!foundTrack) {
            await message.reply(`❌ Nie znaleziono utworu o nazwie "${queryText}" w katalogu Spotify.`);
            return;
          }
          trackUri = foundTrack.uri;
          trackDetails = `**${foundTrack.name}** — ${foundTrack.artists.map(a => a.name).join(', ')}`;
        }

        if (trackUri) {
          await spotify.playTrack(message.author.id, trackUri);
          await message.reply(`💿 Odtwarzanie na Twoim koncie Spotify: ${trackDetails}`);
        }
        return;
      }

      // 12. YOUTUBE
      if (sub === 'youtube') {
        const currently = await spotify.getCurrentlyPlaying(target.id);
        if (!currently || !currently.item) {
          await message.reply(isSelf ? '🎧 Nie odtwarzasz obecnie żadnego utworu na swoim Spotify.' : `🎧 Użytkownik **${target.name}** nie odtwarza obecnie żadnego utworu.`);
          return;
        }

        const track = currently.item;
        const artists = track.artists.map(a => a.name).join(', ');
        const searchName = `${track.name} ${artists}`;

        const loadingMsg = await message.reply(`🔍 Szukam utworu **${track.name}** — ${artists} na YouTube...`);
        try {
          const videoId = await searchYouTube(searchName);
          const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
          await message.reply(`🎶 **YouTube: ${track.name} — ${artists}**\n👉 ${ytUrl}`);
        } catch (ytErr) {
          console.error('[SPOTIFY YT] Search failed:', ytErr);
          await message.reply(`❌ Nie udało się znaleźć tego utworu na YouTube.`);
        }
        return;
      }

      // Nieznana podkomenda
      await message.reply('❌ Nieznana podkomenda. Wpisz `!spotify` aby zobaczyć listę dostępnych opcji.');

    } catch (apiErr) {
      console.error('[SPOTIFY COMMAND ERR]:', apiErr);
      await message.reply(`❌ Błąd Spotify: ${apiErr.message}`);
    }
  }
};
