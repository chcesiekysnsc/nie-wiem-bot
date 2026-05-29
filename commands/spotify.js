const spotifyUtil = require('../utils/spotify');

module.exports = {
  name: 'spotify',
  aliases: ['sp'],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;
    if (!threadId) {
      await message.reply('❌ Ta komenda może być używana tylko w konwersacjach grupowych.');
      return;
    }

    const sub = String(args[0] || '').toLowerCase().trim();

    const helpMessage = 
      `🎛️ **Prawidłowe użycie komendy !spotify:**\n\n` +
      `🔌 **!spotify połącz** • Pozwala połączyć Ambienta z kontem Spotify\n\n` +
      `🔥 **!spotify odłącz** • Pozwala odłączyć Ambienta od konta Spotify\n\n` +
      `🤠 **!spotify profil <@użytkownik (opcjonalnie)>** • Pozwala sprawdzić informacje o Twoim lub oznaczonego użytkownika profilu Spotify\n\n` +
      `🧐 **!spotify grupa** • Pozwala sprawdzić czego obecnie słuchają członkowie tej grupy\n\n` +
      `🎧 **!spotify aktualnie <@użytkownik (opcjonalnie)>** • Pozwala sprawdzić czego obecnie słuchasz Ty lub oznaczony użytkownik\n\n` +
      `⭐ **!spotify toputwory 1m/6m/12m <@użytkownik (opcjonalnie)>** • Pozwala sprawdzić Twoje najczęściej słuchane utwory lub oznaczonego użytkownika w podanym zakresie czasu\n\n` +
      `🤩 **!spotify topartyści 1m/6m/12m <@użytkownik (opcjonalnie)>** • Pozwala sprawdzić Twoich najczęściej słuchanych artystów lub oznaczonego użytkownika w podanym zakresie czasu\n\n` +
      `🕰 **!spotify ostatnie <@użytkownik (opcjonalnie)>** • Pozwala sprawdzić czego ostatnio słuchałeś Ty lub oznaczony użytkownik\n\n` +
      `🥸 **!spotify incognito on/off** • Pozwala wybrać, czy inni członkowie grupy mają mieć możliwość sprawdzania Twoich statystyk Spotify\n\n` +
      `📋 **!spotify kolejka <utwór lub @użytkownik>** • Pozwala dodać do Twojej kolejki odtwarzania wybrany utwór lub ten, którego słucha oznaczony użytkownik\n\n` +
      `💿 **!spotify play <utwór lub @użytkownik>** • Pozwala odtworzyć na Twoim koncie Spotify wybrany utwór lub ten, którego słucha oznaczony użytkownik\n\n` +
      `🎶 **!spotify youtube <@użytkownik (opcjonalnie)>** • Wysyła utwór którego słuchasz Ty lub oznaczony użytkownik z YouTube`;

    if (!sub || sub === 'help' || sub === 'pomoc') {
      await message.reply(helpMessage);
      return;
    }

    // 1. POŁĄCZ
    if (sub === 'połącz' || sub === 'polacz' || sub === 'connect') {
      const url = spotifyUtil.getAuthUrl(message.author.id, threadId);
      await message.reply(
        `🔌 **Spotify Connect**\n\n` +
        `Aby połączyć swoje konto Spotify z botem Ambient, kliknij w poniższy link autoryzacyjny:\n\n` +
        `🔗 ${url}\n\n` +
        `*Uwaga: Po zatwierdzeniu uprawnień na stronie Spotify, zostaniesz przekierowany na stronę potwierdzającą, a na tym czacie pojawi się powiadomienie.*`
      );
      return;
    }

    // 2. ODŁĄCZ
    if (sub === 'odłącz' || sub === 'odlacz' || sub === 'disconnect') {
      const db = spotifyUtil.loadSpotifyDb();
      if (!db[message.author.id]) {
        await message.reply('❌ Twoje konto Spotify nie jest połączone z botem.');
        return;
      }
      delete db[message.author.id];
      spotifyUtil.saveSpotifyDb(db);
      await message.reply('🔥 Pomyślnie odłączono Twoje konto Spotify od bota Ambient.');
      return;
    }

    // Wspólny parser celu (@wzmianka / ID) dla pozostałych komend
    let targetId = message.author.id;
    let targetName = message.author.username || 'Ty';

    const mentioned = message.mentions?.users?.first ? message.mentions.users.first() : null;
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || `Użytkownik_${targetId.slice(-6)}`;
    } else {
      // Szukaj numerycznego ID w argumentach (z pominięciem filtrów czasowych)
      const possibleId = args.slice(1).find(a => a && /^\d+$/.test(a) && !['1m', '6m', '12m'].includes(a));
      if (possibleId) {
        targetId = possibleId;
        targetName = `Użytkownik_${targetId.slice(-6)}`;
        if (client.userNames.has(targetId)) {
          targetName = client.userNames.get(targetId);
        }
      }
    }

    // 3. INCOGNITO
    if (sub === 'incognito') {
      const db = spotifyUtil.loadSpotifyDb();
      if (!db[message.author.id]) {
        await message.reply('❌ Twoje konto Spotify nie jest połączone z botem. Połącz je wpisując `!spotify połącz`.');
        return;
      }

      const statusStr = String(args[1] || '').toLowerCase().trim();
      if (statusStr === 'on' || statusStr === 'włącz' || statusStr === 'wlacz') {
        db[message.author.id].incognito = true;
        spotifyUtil.saveSpotifyDb(db);
        await message.reply('🥸 Tryb incognito został **włączony**. Inni członkowie grupy nie mogą sprawdzać Twoich statystyk Spotify.');
      } else if (statusStr === 'off' || statusStr === 'wyłącz' || statusStr === 'wylacz') {
        db[message.author.id].incognito = false;
        spotifyUtil.saveSpotifyDb(db);
        await message.reply('🥸 Tryb incognito został **wyłączony**. Inni członkowie grupy mogą teraz sprawdzać Twoje statystyki Spotify.');
      } else {
        const currentStatus = db[message.author.id].incognito ? 'Włączony 🟢' : 'Wyłączony 🔴';
        await message.reply(`🥸 Twój obecny status incognito: **${currentStatus}**\n\nAby go zmienić, wpisz: \`!spotify incognito on\` lub \`!spotify incognito off\``);
      }
      return;
    }

    // 4. GRUPA
    if (sub === 'grupa' || sub === 'group') {
      if (!client.api) {
        await message.reply('❌ Brak połączenia z API Messengera.');
        return;
      }

      client.api.getThreadInfo(threadId, async (err, info) => {
        if (err || !info) {
          await message.reply('❌ Nie udało się pobrać informacji o grupie.');
          return;
        }

        const participants = info.participantIDs || [];
        const listening = [];

        for (const pId of participants) {
          const token = await spotifyUtil.getAccessToken(pId);
          if (!token) continue;

          const db = spotifyUtil.loadSpotifyDb();
          if (db[pId].incognito) continue;

          try {
            const current = await spotifyUtil.getCurrentlyPlaying(token);
            if (current && current.is_playing && current.item) {
              const pName = await client.resolveUserName(client.api, pId);
              const artists = current.item.artists.map(a => a.name).join(', ');
              listening.push(`👤 **${pName}** słucha:\n   🎵 **${current.item.name}** — ${artists}`);
            }
          } catch (_) {}
        }

        if (listening.length === 0) {
          await message.reply('🧐 Żaden z połączonych członków grupy nie słucha obecnie muzyki na Spotify.');
          return;
        }

        await message.reply(`🧐 **Czego obecnie słuchają członkowie grupy?**\n\n${listening.join('\n\n')}`);
      });
      return;
    }

    // Sprawdzenie powiązania konta Spotify i trybu incognito dla pozostałych komend z zapytaniem API
    const token = await spotifyUtil.getAccessToken(targetId);
    if (!token) {
      await message.reply(targetId === message.author.id
        ? '❌ Twoje konto Spotify nie jest połączone z botem. Połącz je za pomocą `!spotify połącz`.'
        : `❌ Użytkownik **${targetName}** nie połączył jeszcze swojego konta Spotify.`);
      return;
    }

    const db = spotifyUtil.loadSpotifyDb();
    if (targetId !== message.author.id && db[targetId].incognito) {
      await message.reply(`❌ Użytkownik **${targetName}** ma włączony tryb incognito.`);
      return;
    }

    // 5. PROFIL
    if (sub === 'profil' || sub === 'profile') {
      try {
        const profile = await spotifyUtil.getProfile(token);
        const infoMsg =
          `🤠 **Profil Spotify — ${targetName}**\n\n` +
          `👤 Nazwa na Spotify: **${profile.display_name || profile.id}**\n` +
          `📈 Obserwujący: **${profile.followers?.total || 0}**\n` +
          `📦 Typ konta: **${profile.product || 'unknown'}**\n` +
          `🔗 Link do profilu: ${profile.external_urls?.spotify || 'Brak'}`;
        await message.reply(infoMsg);
      } catch (err) {
        await message.reply(`❌ Błąd podczas pobierania profilu Spotify: ${err.message}`);
      }
      return;
    }

    // 6. AKTUALNIE
    if (sub === 'aktualnie' || sub === 'currently' || sub === 'now') {
      try {
        const current = await spotifyUtil.getCurrentlyPlaying(token);
        if (!current || !current.item) {
          await message.reply(targetId === message.author.id
            ? '🎧 Nie słuchasz obecnie niczego na Spotify (lub Twoje odtwarzanie jest wstrzymane).'
            : `🎧 Użytkownik **${targetName}** nie słucha obecnie niczego na Spotify.`);
          return;
        }

        const track = current.item;
        const progressMs = current.progress_ms;
        const durationMs = track.duration_ms;

        // Pasek postępu
        const barSize = 15;
        const dotPosition = Math.min(barSize - 1, Math.floor((progressMs / durationMs) * barSize));
        let bar = '';
        for (let i = 0; i < barSize; i++) {
          bar += i === dotPosition ? '🔘' : '▬';
        }

        const mToReadable = (ms) => {
          const mins = Math.floor(ms / 60000);
          const secs = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
          return `${mins}:${secs}`;
        };

        const artists = track.artists.map(a => a.name).join(', ');
        const replyMsg =
          `🎧 **Obecnie słucha — ${targetName}**\n\n` +
          `🎵 Utwór: **${track.name}**\n` +
          `👤 Artysta: **${artists}**\n` +
          `💿 Album: **${track.album.name}**\n\n` +
          `▶️ ${bar} [${mToReadable(progressMs)} / ${mToReadable(durationMs)}]\n\n` +
          `🔗 Słuchaj na Spotify: ${track.external_urls?.spotify || 'Brak'}`;

        await message.reply(replyMsg);
      } catch (err) {
        await message.reply(`❌ Błąd podczas pobierania obecnie odtwarzanego utworu: ${err.message}`);
      }
      return;
    }

    // 7. OSTATNIE
    if (sub === 'ostatnie' || sub === 'recent' || sub === 'last') {
      try {
        const recent = await spotifyUtil.getRecentlyPlayed(token, 5);
        if (!recent.items || recent.items.length === 0) {
          await message.reply(`🕰 Użytkownik **${targetName}** nie posiada ostatnio odtwarzanych utworów.`);
          return;
        }

        const lines = recent.items.map((item, idx) => {
          const artists = item.track.artists.map(a => a.name).join(', ');
          const playedAt = new Date(item.played_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
          return `${idx + 1}. **${item.track.name}** — ${artists} *(o ${playedAt})*`;
        }).join('\n');

        await message.reply(`🕰 **Ostatnio słuchane utwory — ${targetName}**\n\n${lines}`);
      } catch (err) {
        await message.reply(`❌ Błąd podczas pobierania ostatnio słuchanych utworów: ${err.message}`);
      }
      return;
    }

    // Rozpoznawanie zakresu czasowego dla top utwory/artyści
    let range = 'medium_term';
    let rangeLabel = 'ostatnie 6 miesięcy';
    const rangeArg = args.slice(1).find(a => ['1m', '6m', '12m'].includes(String(a).toLowerCase()));
    if (rangeArg) {
      const r = rangeArg.toLowerCase();
      if (r === '1m') {
        range = 'short_term';
        rangeLabel = 'ostatni miesiąc';
      } else if (r === '12m') {
        range = 'long_term';
        rangeLabel = 'ostatnie 12 miesięcy';
      }
    }

    // 8. TOPUTWORY
    if (sub === 'toputwory' || sub === 'toptracks') {
      try {
        const top = await spotifyUtil.getTopTracks(token, range, 5);
        if (!top.items || top.items.length === 0) {
          await message.reply(`⭐ Brak danych o najczęściej słuchanych utworach dla **${targetName}**.`);
          return;
        }

        const lines = top.items.map((track, idx) => {
          const artists = track.artists.map(a => a.name).join(', ');
          return `${idx + 1}. **${track.name}** — ${artists}`;
        }).join('\n');

        await message.reply(`⭐ **Top utwory (${rangeLabel}) — ${targetName}**\n\n${lines}`);
      } catch (err) {
        await message.reply(`❌ Błąd podczas pobierania top utworów: ${err.message}`);
      }
      return;
    }

    // 9. TOPARTYŚCI
    if (sub === 'topartyści' || sub === 'topartysci' || sub === 'topartists') {
      try {
        const top = await spotifyUtil.getTopArtists(token, range, 5);
        if (!top.items || top.items.length === 0) {
          await message.reply(`🤩 Brak danych o najczęściej słuchanych artystach dla **${targetName}**.`);
          return;
        }

        const lines = top.items.map((artist, idx) => {
          return `${idx + 1}. **${artist.name}** — ${artist.genres.slice(0, 2).join(', ') || 'pop'}`;
        }).join('\n');

        await message.reply(`🤩 **Top artyści (${rangeLabel}) — ${targetName}**\n\n${lines}`);
      } catch (err) {
        await message.reply(`❌ Błąd podczas pobierania top artystów: ${err.message}`);
      }
      return;
    }

    // 10. KOLEJKA
    if (sub === 'kolejka' || sub === 'queue') {
      // Dla kolejki autorem operacji jest nadawca wiadomości (dodajemy do jego kolejki)
      const userToken = await spotifyUtil.getAccessToken(message.author.id);
      if (!userToken) {
        await message.reply('❌ Twoje konto Spotify nie jest połączone z botem. Połącz je wpisując `!spotify połącz`.');
        return;
      }

      let trackUri = null;
      let trackName = '';
      let trackArtists = '';

      const targetMention = message.mentions?.users?.first ? message.mentions.users.first() : null;
      if (targetMention) {
        const targetToken = await spotifyUtil.getAccessToken(targetMention.id);
        if (!targetToken) {
          await message.reply(`❌ Użytkownik **${targetMention.username}** nie połączył konta ze Spotify.`);
          return;
        }
        const db = spotifyUtil.loadSpotifyDb();
        if (db[targetMention.id].incognito) {
          await message.reply(`❌ Użytkownik **${targetMention.username}** ma włączony tryb incognito.`);
          return;
        }

        const current = await spotifyUtil.getCurrentlyPlaying(targetToken);
        if (!current || !current.item) {
          await message.reply(`❌ Użytkownik **${targetMention.username}** nie słucha obecnie niczego.`);
          return;
        }
        trackUri = current.item.uri;
        trackName = current.item.name;
        trackArtists = current.item.artists.map(a => a.name).join(', ');
      } else {
        const query = args.slice(1).join(' ');
        if (!query) {
          await message.reply('❌ Podaj nazwę utworu lub oznacz użytkownika: **!spotify kolejka <utwór / @użytkownik>**');
          return;
        }

        const searchResult = await spotifyUtil.searchTrack(userToken, query);
        if (!searchResult) {
          await message.reply(`❌ Nie znaleziono utworu dla zapytania: "${query}"`);
          return;
        }
        trackUri = searchResult.uri;
        trackName = searchResult.name;
        trackArtists = searchResult.artists.map(a => a.name).join(', ');
      }

      try {
        await spotifyUtil.addToQueue(userToken, trackUri);
        await message.reply(`📋 Dodano do Twojej kolejki odtwarzania Spotify:\n🎵 **${trackName}** — ${trackArtists}`);
      } catch (err) {
        if (err.message === 'device_not_found') {
          await message.reply('❌ Brak aktywnego odtwarzacza Spotify. Otwórz aplikację Spotify na dowolnym urządzeniu i spróbuj ponownie.');
        } else {
          await message.reply(`❌ Błąd podczas dodawania do kolejki: ${err.message}`);
        }
      }
      return;
    }

    // 11. PLAY
    if (sub === 'play' || sub === 'odtwórz' || sub === 'odtworz') {
      const userToken = await spotifyUtil.getAccessToken(message.author.id);
      if (!userToken) {
        await message.reply('❌ Twoje konto Spotify nie jest połączone z botem. Połącz je wpisując `!spotify połącz`.');
        return;
      }

      let trackUri = null;
      let trackName = '';
      let trackArtists = '';

      const targetMention = message.mentions?.users?.first ? message.mentions.users.first() : null;
      if (targetMention) {
        const targetToken = await spotifyUtil.getAccessToken(targetMention.id);
        if (!targetToken) {
          await message.reply(`❌ Użytkownik **${targetMention.username}** nie połączył konta ze Spotify.`);
          return;
        }
        const db = spotifyUtil.loadSpotifyDb();
        if (db[targetMention.id].incognito) {
          await message.reply(`❌ Użytkownik **${targetMention.username}** ma włączony tryb incognito.`);
          return;
        }

        const current = await spotifyUtil.getCurrentlyPlaying(targetToken);
        if (!current || !current.item) {
          await message.reply(`❌ Użytkownik **${targetMention.username}** nie słucha obecnie niczego.`);
          return;
        }
        trackUri = current.item.uri;
        trackName = current.item.name;
        trackArtists = current.item.artists.map(a => a.name).join(', ');
      } else {
        const query = args.slice(1).join(' ');
        if (!query) {
          await message.reply('❌ Podaj nazwę utworu lub oznacz użytkownika: **!spotify play <utwór / @użytkownik>**');
          return;
        }

        const searchResult = await spotifyUtil.searchTrack(userToken, query);
        if (!searchResult) {
          await message.reply(`❌ Nie znaleziono utworu dla zapytania: "${query}"`);
          return;
        }
        trackUri = searchResult.uri;
        trackName = searchResult.name;
        trackArtists = searchResult.artists.map(a => a.name).join(', ');
      }

      try {
        await spotifyUtil.playTrack(userToken, trackUri);
        await message.reply(`💿 Odtwarzam na Twoim koncie Spotify:\n🎵 **${trackName}** — ${trackArtists}`);
      } catch (err) {
        if (err.message === 'device_not_found') {
          await message.reply('❌ Brak aktywnego odtwarzacza Spotify. Otwórz aplikację Spotify na dowolnym urządzeniu i spróbuj ponownie.');
        } else {
          await message.reply(`❌ Błąd podczas odtwarzania: ${err.message}`);
        }
      }
      return;
    }

    // 12. YOUTUBE
    if (sub === 'youtube' || sub === 'yt') {
      try {
        const current = await spotifyUtil.getCurrentlyPlaying(token);
        if (!current || !current.item) {
          await message.reply(targetId === message.author.id
            ? '❌ Nie słuchasz obecnie niczego na Spotify.'
            : `❌ Użytkownik **${targetName}** nie słucha obecnie niczego.`);
          return;
        }

        const track = current.item;
        const artists = track.artists.map(a => a.name).join(', ');
        const query = `${artists} - ${track.name}`;

        await message.reply(`🔍 Trwa wyszukiwanie utworu "${query}" na YouTube...`);
        const ytLink = await spotifyUtil.searchYouTubeVideo(query);

        await message.reply(`🎶 **YouTube — ${track.name}**\n\n🔗 Obejrzyj/Posłuchaj na YouTube:\n${ytLink}`);
      } catch (err) {
        await message.reply(`❌ Błąd podczas szukania na YouTube: ${err.message}`);
      }
      return;
    }

    // Fallback do pomocy
    await message.reply(helpMessage);
  }
};
