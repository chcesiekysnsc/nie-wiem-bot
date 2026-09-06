const fs = require('fs');
const https = require('https');
const path = require('path');
const { withData } = require('../utils/storage');

const LASTFM_API_KEY = process.env.LASTFM_API_KEY || '1859208d097179d09958235ef6bcea23';

const PERIOD_MAPPING = {
  '7d': '7day',
  '1m': '1month',
  '3m': '3month',
  '6m': '6month',
  '12m': '12month',
  'all': 'overall',
  'overall': 'overall'
};

const PERIOD_LABELS = {
  '7day': 'ostatnie 7 dni',
  '1month': 'ostatni miesiąc',
  '3month': 'ostatnie 3 miesiące',
  '6month': 'ostatnie 6 miesięcy',
  '12month': 'ostatni rok',
  'overall': 'cały czas'
};

function fetchLastFMAPI(method, params = {}) {
  return new Promise((resolve, reject) => {
    const queryParams = new URLSearchParams({
      method,
      api_key: LASTFM_API_KEY,
      format: 'json',
      ...params
    });

    const url = `https://ws.audioscrobbler.com/2.0/?${queryParams.toString()}`;

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MessengerBot/1.0'
      }
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Błąd HTTP ${res.statusCode}`));
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            return reject(new Error(parsed.message || `Kod błędu Last.fm: ${parsed.error}`));
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error('Niepoprawna odpowiedź JSON z Last.fm API.'));
        }
      });
    });

    req.setTimeout(10000, () => {
      req.destroy(new Error('Przekroczono limit czasu żądania do Last.fm API.'));
    });

    req.on('error', reject);
  });
}

function parseArgs(message, args) {
  let range = 'overall';
  let targetId = message.author.id;
  let targetName = message.author.username || `Użytkownik_${targetId.slice(-6)}`;
  let searchQuery = '';

  const ranges = ['1m', '3m', '6m', '12m', '7d', 'all', 'overall'];
  const cleanArgs = [...args];

  const rangeIndex = cleanArgs.findIndex(arg => ranges.includes(arg.toLowerCase()));
  if (rangeIndex !== -1) {
    range = cleanArgs[rangeIndex].toLowerCase();
    cleanArgs.splice(rangeIndex, 1);
  }

  const mentioned = message.mentions?.users?.first();
  if (mentioned) {
    targetId = mentioned.id;
    targetName = mentioned.username || `Użytkownik_${targetId.slice(-6)}`;
    const mentionRegex = /^<@!?\d+>$/;
    const mentionIndex = cleanArgs.findIndex(arg => mentionRegex.test(arg) || arg.includes(mentioned.id));
    if (mentionIndex !== -1) {
      cleanArgs.splice(mentionIndex, 1);
    }
  } else {
    const idIndex = cleanArgs.findIndex(arg => /^\d+$/.test(arg));
    if (idIndex !== -1 && cleanArgs[idIndex].length >= 8) {
      targetId = cleanArgs[idIndex];
      targetName = `Użytkownik_${targetId.slice(-6)}`;
      if (message.client?.userNames?.has(targetId)) {
        targetName = message.client.userNames.get(targetId);
      }
      cleanArgs.splice(idIndex, 1);
    }
  }

  searchQuery = cleanArgs.join(' ').trim();

  return { range, targetId, targetName, searchQuery };
}

module.exports = {
  name: 'fm',
  aliases: ['lastfm'],
  async execute(client, message, args) {
    const sub = String(args[0] || '').toLowerCase().trim();

    if (!sub) {
      await message.reply(
        `🎛️ **Prawidłowe użycie komendy !fm (lub !lastfm):**\n\n` +
        `🔌 \`!fm połącz <nazwa>\` • Pozwala połączyć konto z Last.fm\n` +
        `🔥 \`!fm odłącz\` • Pozwala odłączyć konto od Last.fm\n` +
        `🤠 \`!fm profil [@użytkownik]\` • Pozwala sprawdzić informacje o profilu Spotify/Last.fm\n` +
        `🧐 \`!fm grupa\` • Pozwala sprawdzić czego obecnie słuchają członkowie grupy\n` +
        `🎧 \`!fm aktualnie [@użytkownik]\` • Pozwala sprawdzić czego obecnie słuchasz Ty lub oznaczony użytkownik\n` +
        `⭐ \`!fm toputwory [okres] [@osoba]\` • Top utwory (okres: 1m/3m/6m/12m/all, domyślnie: overall)\n` +
        `🤩 \`!fm topartyści [okres] [@osoba]\` • Top artyści (okres: 1m/3m/6m/12m/all, domyślnie: overall)\n` +
        `💿 \`!fm topalbumy [okres] [@osoba]\` • Top albumy (okres: 1m/3m/6m/12m/all, domyślnie: overall)\n` +
        `🕰 \`!fm ostatnie [@użytkownik]\` • Czego ostatnio słuchałeś Ty lub oznaczony użytkownik\n` +
        `🥸 \`!fm incognito <on/off>\` • Czy inni mogą sprawdzać Twoje statystyki w grupie\n` +
        `💿 \`!fm play <utwór / @użytkownik>\` • Szukaj i odtwórz utwór na YouTube\n` +
        `🎶 \`!fm youtube [@użytkownik]\` • Link YouTube do aktualnie odtwarzanego utworu\n` +
        `🏆 \`!fm top\` • Pokazuje ranking Top 5 osób w grupie z największą liczbą scrobbli`
      );
      return;
    }

    // 1. POŁĄCZ
    if (['połącz', 'polacz', 'connect'].includes(sub)) {
      const username = String(args[1] || '').trim();
      if (!username) {
        await message.reply('❌ Podaj swoją nazwę użytkownika Last.fm: **!fm połącz <nazwa>**');
        return;
      }

      try {
        const data = await fetchLastFMAPI('user.getinfo', { user: username });
        const user = data.user;
        const playcount = Number(user.playcount || 0).toLocaleString('pl-PL');
        const regDate = user.registered?.unixtime 
          ? new Date(user.registered.unixtime * 1000).toLocaleDateString('pl-PL')
          : 'Nieznana';

        await withData(store => {
          store.profiles.lastfmConnections = store.profiles.lastfmConnections || {};
          store.profiles.lastfmConnections[message.author.id] = {
            username: user.name,
            incognito: false
          };
        });

        await message.reply(
          `🔌 **Konto połączone pomyślnie!**\n` +
          `Nazwa: **${user.name}**\n` +
          `Odtworzenia: **${playcount}**\n` +
          `Dołączono: **${regDate}**`
        );
      } catch (err) {
        console.error('[LASTFM CONNECT]', err);
        await message.reply(`❌ Nie udało się połączyć konta Last.fm "${username}". Upewnij się, że nazwa jest poprawna.`);
      }
      return;
    }

    // 2. ODŁĄCZ
    if (['odłącz', 'odlacz', 'disconnect'].includes(sub)) {
      let disconnected = false;
      await withData(store => {
        if (store.profiles.lastfmConnections && store.profiles.lastfmConnections[message.author.id]) {
          delete store.profiles.lastfmConnections[message.author.id];
          disconnected = true;
        }
      });

      if (disconnected) {
        await message.reply('🔥 **Konto Last.fm zostało pomyślnie odłączone.**');
      } else {
        await message.reply('ℹ️ Twoje konto nie jest połączone z Last.fm.');
      }
      return;
    }

    // 2.5 TOP (RANKING)
    if (['top', 'ranking', 'liderzy'].includes(sub)) {
      async function getName(id) {
        if (client.userNames && client.userNames.has(id)) {
          return client.userNames.get(id);
        }
        if (client.resolveUserName) {
          try {
            const name = await client.resolveUserName(client.api, id);
            if (name) return name;
          } catch (_) {}
        }
        return `Użytkownik_${String(id).slice(-6)}`;
      }

      try {
        const threadId = message.guild?.id || message.rawEvent?.threadID;
        if (!threadId) {
          await message.reply('❌ Nie można pobrać ID konwersacji.');
          return;
        }

        const threadInfo = await new Promise((resolve, reject) => {
          client.api.getThreadInfo(threadId, (err, ret) => {
            if (err) return reject(err);
            resolve(ret);
          });
        });

        const participantIDs = threadInfo.participantIDs || [];
        const connections = {};

        await withData(store => {
          if (store.profiles.lastfmConnections) {
            for (const pid of participantIDs) {
              if (store.profiles.lastfmConnections[pid]) {
                connections[pid] = store.profiles.lastfmConnections[pid];
              }
            }
          }
        });

        const activeProfiles = Object.entries(connections);
        if (activeProfiles.length === 0) {
          await message.reply('🧐 Nikt z tej grupy nie połączył swojego konta z Last.fm.');
          return;
        }

        const results = [];
        for (const [pid, conn] of activeProfiles) {
          if (conn.incognito === true && pid !== message.author.id) {
            continue;
          }

          const name = await getName(pid);
          try {
            const data = await fetchLastFMAPI('user.getinfo', { user: conn.username });
            const scrobbles = parseInt(data.user.playcount, 10) || 0;
            results.push({
              pid,
              name,
              username: conn.username,
              scrobbles,
              scrobblesStr: scrobbles.toLocaleString('pl-PL')
            });
          } catch (e) {
            results.push({
              pid,
              name,
              username: conn.username,
              scrobbles: 0,
              scrobblesStr: '0'
            });
          }
        }

        results.sort((a, b) => b.scrobbles - a.scrobbles);

        const top5 = results.slice(0, 5);
        const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
        const lines = top5.map((r, i) => {
          return `${medals[i]} **${r.name}** (${r.username}) — **${r.scrobblesStr}** scrobbli`;
        }).join('\n');

        const myIndex = results.findIndex(r => r.pid === message.author.id);
        let myRankText = '';
        if (myIndex !== -1) {
          myRankText = `Twoje miejsce w grupie: **${myIndex + 1} z ${results.length}** użytkowników z połączonym Last.fm`;
        } else {
          myRankText = `Nie ma Cię w rankingu (brak połączonego konta Last.fm lub jesteś incognito)`;
        }

        const responseText = 
          `🏆 **Ranking Last.fm w Grupie (Top 5)**\n\n` +
          `${lines || 'Brak danych.'}\n\n` +
          `ℹ️ *${myRankText}*`;

        await message.reply(responseText);
      } catch (err) {
        console.error('[LASTFM TOP ERROR]', err);
        await message.reply(`❌ Wystąpił błąd podczas generowania rankingu: ${err.message}`);
      }
      return;
    }

    // Parsowanie argumentów dla reszty komend
    const parsedParams = parseArgs(message, args.slice(1));
    const targetId = parsedParams.targetId;
    const targetName = parsedParams.targetName;
    const isSelf = (targetId === message.author.id);

    let connection = null;
    await withData(store => {
      if (store.profiles.lastfmConnections && store.profiles.lastfmConnections[targetId]) {
        connection = store.profiles.lastfmConnections[targetId];
      }
    });

    if (!connection) {
      if (isSelf) {
        await message.reply('❌ Nie połączyłeś swojego konta z Last.fm. Zrób to za pomocą: **!fm połącz <nazwa_konta>**');
      } else {
        await message.reply(`❌ Użytkownik **${targetName}** nie połączył swojego konta z Last.fm.`);
      }
      return;
    }

    if (!isSelf && connection.incognito === true) {
      await message.reply(`🔒 Użytkownik **${targetName}** włączył tryb incognito i nie możesz sprawdzać jego statystyk.`);
      return;
    }

    const lastfmUser = connection.username;

    // 3. INCOGNITO
    if (sub === 'incognito') {
      const mode = String(args[1] || '').toLowerCase().trim();
      if (mode !== 'on' && mode !== 'off') {
        await message.reply('ℹ️ Użycie: **!fm incognito <on/off>**');
        return;
      }

      const enabled = (mode === 'on');
      await withData(store => {
        if (store.profiles.lastfmConnections && store.profiles.lastfmConnections[message.author.id]) {
          store.profiles.lastfmConnections[message.author.id].incognito = enabled;
        }
      });

      if (enabled) {
        await message.reply('🔒 Tryb incognito został **WŁĄCZONY**. Inni członkowie grupy nie mogą sprawdzać Twoich statystyk.');
      } else {
        await message.reply('🔓 Tryb incognito został **WYŁĄCZONY**. Twoje statystyki są publicznie dostępne dla grupy.');
      }
      return;
    }

    // 4. PROFIL
    if (['profil', 'profile', 'pfp'].includes(sub)) {
      try {
        const data = await fetchLastFMAPI('user.getinfo', { user: lastfmUser });
        const user = data.user;
        const playcount = Number(user.playcount || 0).toLocaleString('pl-PL');
        const regDate = user.registered?.unixtime 
          ? new Date(user.registered.unixtime * 1000).toLocaleDateString('pl-PL')
          : 'Nieznana';
        const avatar = user.image?.find(img => img.size === 'large' || img.size === 'extralarge')?.['#text'] || '';

        let msg = `🤠 **Profil Last.fm — ${targetName}** (${user.name})\n` +
                  `👤 Nazwa wyświetlana: **${user.name}**\n` +
                  `🎵 Wszystkie odtworzenia (scrobbles): **${playcount}**\n` +
                  `📅 Scrobbluje od: **${regDate}**`;

        if (avatar) {
          msg += `\n🖼️ Awatar: ${avatar}`;
        }
        await message.reply(msg);
      } catch (err) {
        console.error('[LASTFM PROFILE]', err);
        await message.reply(`❌ Wystąpił błąd podczas pobierania profilu: ${err.message}`);
      }
      return;
    }

    // 5. AKTUALNIE
    if (['aktualnie', 'current', 'now'].includes(sub)) {
      try {
        const data = await fetchLastFMAPI('user.getrecenttracks', { user: lastfmUser, limit: 1 });
        const tracks = data.recenttracks?.track || [];
        const currentTrack = Array.isArray(tracks) ? tracks[0] : tracks;

        if (currentTrack) {
          const isNowPlaying = currentTrack['@attr']?.nowplaying === 'true';
          const trackName = currentTrack.name;
          const artistName = currentTrack.artist?.['#text'] || currentTrack.artist?.name || 'Nieznany';

          if (isNowPlaying) {
            const query = encodeURIComponent(`${artistName} ${trackName}`);
            const youtubeUrl = `https://www.youtube.com/results?search_query=${query}`;
            await message.reply(
              `🎧 **Aktualnie słucha — ${targetName}**\n` +
              `🎶 Utwór: **${trackName}**\n` +
              `👤 Wykonawca: **${artistName}**\n` +
              `📺 Odtwórz: ${youtubeUrl}`
            );
          } else {
            await message.reply(
              `💤 **${targetName}** obecnie niczego nie słucha.\n` +
              `🕰 Ostatnio odtwarzane: **${artistName} - ${trackName}**`
            );
          }
        } else {
          await message.reply(`💤 **${targetName}** obecnie niczego nie słucha.`);
        }
      } catch (err) {
        console.error('[LASTFM CURRENT]', err);
        await message.reply(`❌ Wystąpił błąd podczas sprawdzania aktualnego utworu: ${err.message}`);
      }
      return;
    }

    // 6. OSTATNIE
    if (['ostatnie', 'recent', 'last'].includes(sub)) {
      try {
        const data = await fetchLastFMAPI('user.getrecenttracks', { user: lastfmUser, limit: 5 });
        const tracks = data.recenttracks?.track || [];
        const trackList = Array.isArray(tracks) ? tracks : [tracks];

        if (trackList.length === 0) {
          await message.reply(`🕰 Brak ostatnio odtwarzanych utworów dla użytkownika **${targetName}**.`);
          return;
        }

        const lines = trackList.map((t, i) => {
          const isNowPlaying = t['@attr']?.nowplaying === 'true';
          const status = isNowPlaying ? '▶️ *słucha teraz*' : '•';
          const artist = t.artist?.['#text'] || t.artist?.name || 'Nieznany';
          return `${i + 1}. ${status} **${artist}** — **${t.name}**`;
        }).join('\n');

        await message.reply(`🕰 **Ostatnio słuchane przez ${targetName}**:\n\n${lines}`);
      } catch (err) {
        console.error('[LASTFM RECENT]', err);
        await message.reply(`❌ Wystąpił błąd podczas pobierania ostatnich utworów: ${err.message}`);
      }
      return;
    }

    // 7. TOPUTWORY / TOPARTYŚCI / TOPALBUMY
    if (['toputwory', 'topartyści', 'topartysci', 'topalbumy', 'toptracks', 'topartists', 'topalbums', 'tracks', 'artists', 'albums'].includes(sub)) {
      const type = ['topartyści', 'topartysci', 'topartists', 'artists'].includes(sub) ? 'artists'
                 : (['topalbumy', 'topalbums', 'albums'].includes(sub) ? 'albums' : 'tracks');

      const period = PERIOD_MAPPING[parsedParams.range] || 'overall';
      const label = PERIOD_LABELS[period];

      const typeLabel = type === 'artists' ? 'artystów' : (type === 'albums' ? 'albumów' : 'utworów');
      const categoryEmoji = type === 'artists' ? '🤩' : (type === 'albums' ? '💿' : '⭐');

      try {
        const method = type === 'artists' ? 'user.gettopartists'
                     : (type === 'albums' ? 'user.gettopalbums' : 'user.gettoptracks');

        const data = await fetchLastFMAPI(method, { user: lastfmUser, period, limit: 10 });
        
        let items = [];
        if (type === 'artists') items = data.topartists?.artist || [];
        else if (type === 'albums') items = data.topalbums?.album || [];
        else items = data.toptracks?.track || [];

        const itemList = Array.isArray(items) ? items : [items];

        if (itemList.length === 0) {
          await message.reply(`📊 Brak statystyk ${typeLabel} dla użytkownika **${targetName}** w wybranym przedziale czasowym.`);
          return;
        }

        const lines = itemList.map((item, i) => {
          const playcount = Number(item.playcount || 0).toLocaleString('pl-PL');
          const artist = item.artist?.name ? `**${item.artist.name}** — ` : '';
          return `${i + 1}. ${artist}**${item.name}** (${playcount} odtworzeń)`;
        }).join('\n');

        await message.reply(`${categoryEmoji} **Top 10 ${typeLabel} u ${targetName} (${label})**:\n\n${lines}`);
      } catch (err) {
        console.error('[LASTFM TOP]', err);
        await message.reply(`❌ Wystąpił błąd podczas pobierania statystyk: ${err.message}`);
      }
      return;
    }

    // 8. YOUTUBE
    if (['youtube', 'yt'].includes(sub)) {
      try {
        const data = await fetchLastFMAPI('user.getrecenttracks', { user: lastfmUser, limit: 1 });
        const tracks = data.recenttracks?.track || [];
        const currentTrack = Array.isArray(tracks) ? tracks[0] : tracks;

        if (currentTrack) {
          const trackName = currentTrack.name;
          const artistName = currentTrack.artist?.['#text'] || currentTrack.artist?.name || 'Nieznany';
          const query = encodeURIComponent(`${artistName} ${trackName}`);
          const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${query}`;

          await message.reply(
            `🎶 **YouTube — ${targetName}**\n` +
            `Utwór: **${artistName} - ${trackName}**\n` +
            `🔗 Odtwórz: ${youtubeSearchUrl}`
          );
        } else {
          await message.reply(`💤 **${targetName}** obecnie niczego nie słucha.`);
        }
      } catch (err) {
        console.error('[LASTFM YOUTUBE]', err);
        await message.reply(`❌ Wystąpił błąd podczas wyszukiwania utworu na YouTube: ${err.message}`);
      }
      return;
    }

    // 9. PLAY
    if (sub === 'play') {
      let query = parsedParams.searchQuery;
      let finalTrackName = '';

      if (!query && args.length > 1) {
        query = args.slice(1).join(' ').trim();
      }

      if (query) {
        finalTrackName = query;
      } else {
        try {
          const data = await fetchLastFMAPI('user.getrecenttracks', { user: lastfmUser, limit: 1 });
          const tracks = data.recenttracks?.track || [];
          const currentTrack = Array.isArray(tracks) ? tracks[0] : tracks;

          if (currentTrack) {
            const trackName = currentTrack.name;
            const artistName = currentTrack.artist?.['#text'] || currentTrack.artist?.name || 'Nieznany';
            finalTrackName = `${artistName} - ${trackName}`;
          } else {
            await message.reply(`❌ Użytkownik **${targetName}** obecnie niczego nie słucha, a nie podałeś nazwy utworu.`);
            return;
          }
        } catch (err) {
          console.error('[LASTFM PLAY FETCH]', err);
          await message.reply(`❌ Wystąpił błąd podczas sprawdzania utworu do odtworzenia: ${err.message}`);
          return;
        }
      }

      const finalUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(finalTrackName)}`;

      await message.reply(
        `💿 **Odtwarzanie/Wyszukiwanie utworu**\n` +
        `Utwór: **${finalTrackName}**\n\n` +
        `*(Last.fm nie obsługuje bezpośredniego sterowania odtwarzaczem, ale możesz posłuchać utworu pod tym linkiem:)*\n` +
        `🔗 Link: ${finalUrl}`
      );
      return;
    }

    // 10. GRUPA
    if (['grupa', 'group'].includes(sub)) {
      try {
        const threadInfo = await new Promise((resolve, reject) => {
          client.api.getThreadInfo(message.guild?.id || message.rawEvent?.threadID, (err, ret) => {
            if (err) return reject(err);
            resolve(ret);
          });
        });

        const participantIDs = threadInfo.participantIDs || [];
        const connections = {};

        await withData(store => {
          if (store.profiles.lastfmConnections) {
            for (const pid of participantIDs) {
              if (store.profiles.lastfmConnections[pid]) {
                connections[pid] = store.profiles.lastfmConnections[pid];
              }
            }
          }
        });

        const activeProfiles = Object.entries(connections);
        if (activeProfiles.length === 0) {
          await message.reply('🧐 Nikt z tej grupy nie połączył swojego konta z Last.fm.');
          return;
        }

        const statusLines = [];

        for (const [pid, conn] of activeProfiles) {
          if (conn.incognito === true && pid !== message.author.id) {
            continue;
          }

          let name = `Użytkownik_${pid.slice(-6)}`;
          if (client.userNames?.has(pid)) {
            name = client.userNames.get(pid);
          } else if (client.resolveUserName) {
            try {
              name = await client.resolveUserName(client.api, pid);
            } catch (_) {}
          }

          try {
            const data = await fetchLastFMAPI('user.getrecenttracks', { user: conn.username, limit: 1 });
            const tracks = data.recenttracks?.track || [];
            const currentTrack = Array.isArray(tracks) ? tracks[0] : tracks;

            if (currentTrack && currentTrack['@attr']?.nowplaying === 'true') {
              const trackName = currentTrack.name;
              const artistName = currentTrack.artist?.['#text'] || currentTrack.artist?.name || 'Nieznany';
              statusLines.push(`👤 **${name}** słucha teraz:\n   ▶️ **${artistName}** — **${trackName}**`);
            }
          } catch (e) {
            // Ignorujemy błędy pobierania dla pojedynczych osób z listy
          }
        }

        if (statusLines.length === 0) {
          await message.reply('🧐 Nikt z członków grupy nie słucha obecnie muzyki na połączonych kontach.');
        } else {
          await message.reply(`🧐 **Czego obecnie słuchają członkowie grupy:**\n\n${statusLines.join('\n\n')}`);
        }
      } catch (err) {
        console.error('[LASTFM GROUP]', err);
        await message.reply(`❌ Wystąpił błąd podczas sprawdzania statusów grupy: ${err.message}`);
      }
      return;
    }
  }
};
