const fs = require('fs');
const https = require('https');
const http = require('http');
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

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    if (!url || !url.startsWith('http')) {
      return reject(new Error('Brak prawidłowego URL pliku.'));
    }
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    const req = client.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        file.close();
        fs.unlink(destPath, () => {});
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(destPath));
      });
    });

    req.on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy(new Error('Przekroczono limit pobierania załącznika.'));
    });
  });
}

async function sendReplyWithAttachment(client, message, text, imageUrl) {
  const threadId = message.guild?.id || message.rawEvent?.threadID;

  if (imageUrl && client.api && threadId) {
    const extMatch = imageUrl.split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1] : 'jpg';
    const tempFile = path.join(__dirname, `temp_fm_${Date.now()}_${Math.floor(Math.random()*1000)}.${ext}`);

    try {
      await downloadFile(imageUrl, tempFile);
      await new Promise((resolve) => {
        client.api.sendMessage(
          {
            body: text,
            attachment: fs.createReadStream(tempFile)
          },
          threadId,
          (err) => {
            fs.unlink(tempFile, () => {});
            resolve();
          },
          message.rawEvent?.messageID
        );
      });
      return;
    } catch (e) {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  }

  // Fallback gdy brak załącznika lub pobieranie nie powiodło się
  await message.reply(text);
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
        `🤠 \`!fm profil [@użytkownik]\` • Pozwala sprawdzić pełne informacje i statystyki profilu Last.fm\n` +
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
        const avatar = user.image?.find(img => img.size === 'extralarge' || img.size === 'large')?.['#text'] || '';

        await withData(store => {
          store.profiles.lastfmConnections = store.profiles.lastfmConnections || {};
          store.profiles.lastfmConnections[message.author.id] = {
            username: user.name,
            incognito: false
          };
        });

        const replyText = 
          `🔌 **Konto połączone pomyślnie!**\n` +
          `Nazwa: **${user.name}**\n` +
          `Odtworzenia: **${playcount}**\n` +
          `Dołączono: **${regDate}**`;

        await sendReplyWithAttachment(client, message, replyText, avatar);
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
        let topAvatar = '';

        for (const [pid, conn] of activeProfiles) {
          if (conn.incognito === true && pid !== message.author.id) {
            continue;
          }

          const name = await getName(pid);
          try {
            const data = await fetchLastFMAPI('user.getinfo', { user: conn.username });
            const scrobbles = parseInt(data.user.playcount, 10) || 0;
            const avatar = data.user.image?.find(img => img.size === 'extralarge' || img.size === 'large')?.['#text'] || '';
            results.push({
              pid,
              name,
              username: conn.username,
              scrobbles,
              scrobblesStr: scrobbles.toLocaleString('pl-PL'),
              avatar
            });
          } catch (e) {
            results.push({
              pid,
              name,
              username: conn.username,
              scrobbles: 0,
              scrobblesStr: '0',
              avatar: ''
            });
          }
        }

        results.sort((a, b) => b.scrobbles - a.scrobbles);
        if (results.length > 0 && results[0].avatar) {
          topAvatar = results[0].avatar;
        }

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

        await sendReplyWithAttachment(client, message, responseText, topAvatar);
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
    let authorConnection = null;

    await withData(store => {
      if (store.profiles.lastfmConnections) {
        if (store.profiles.lastfmConnections[targetId]) {
          connection = store.profiles.lastfmConnections[targetId];
        }
        if (store.profiles.lastfmConnections[message.author.id]) {
          authorConnection = store.profiles.lastfmConnections[message.author.id];
        }
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

    // 4. PROFIL (Z WSZYSTKIMI NOWYMI ULEPSZENIAMI + ZDJĘCIE AWTARA)
    if (['profil', 'profile', 'pfp'].includes(sub)) {
      try {
        // Pobieramy informacje o użytkowniku, top artystę, top utwór i ostatnie utwory równolegle
        const [userData, topArtistData, topTrackData, recentData] = await Promise.all([
          fetchLastFMAPI('user.getinfo', { user: lastfmUser }).catch(() => null),
          fetchLastFMAPI('user.gettopartists', { user: lastfmUser, limit: 1, period: 'overall' }).catch(() => null),
          fetchLastFMAPI('user.gettoptracks', { user: lastfmUser, limit: 1, period: 'overall' }).catch(() => null),
          fetchLastFMAPI('user.getrecenttracks', { user: lastfmUser, limit: 1 }).catch(() => null)
        ]);

        if (!userData || !userData.user) {
          await message.reply(`❌ Wystąpił błąd podczas pobierania profilu Last.fm dla **${targetName}**.`);
          return;
        }

        const user = userData.user;
        const totalPlaycount = parseInt(user.playcount || 0, 10);
        const playcountFormatted = totalPlaycount.toLocaleString('pl-PL');
        
        // Data rejestracji i wyliczenie średniej dziennej
        const regTimestamp = user.registered?.unixtime ? parseInt(user.registered.unixtime, 10) : null;
        let regDate = 'Nieznana';
        let avgDaily = 0;
        
        if (regTimestamp) {
          regDate = new Date(regTimestamp * 1000).toLocaleDateString('pl-PL');
          const daysSinceReg = Math.max(1, Math.floor((Date.now() - regTimestamp * 1000) / (1000 * 60 * 60 * 24)));
          avgDaily = Math.round(totalPlaycount / daysSinceReg);
        }

        // Awatar
        const avatar = user.image?.find(img => img.size === 'extralarge' || img.size === 'large')?.['#text'] || '';

        // Ulubiony artysta
        const topArtistObj = topArtistData?.topartists?.artist?.[0] || (Array.isArray(topArtistData?.topartists?.artist) ? topArtistData.topartists.artist[0] : topArtistData?.topartists?.artist);
        let topArtistText = 'Brak danych';
        if (topArtistObj) {
          const artistPlays = Number(topArtistObj.playcount || 0).toLocaleString('pl-PL');
          topArtistText = `**${topArtistObj.name}** (${artistPlays} odtworzeń)`;
        }

        // Ulubiony utwór
        const topTrackObj = topTrackData?.toptracks?.track?.[0] || (Array.isArray(topTrackData?.toptracks?.track) ? topTrackData.toptracks.track[0] : topTrackData?.toptracks?.track);
        let topTrackText = 'Brak danych';
        if (topTrackObj) {
          const trackPlays = Number(topTrackObj.playcount || 0).toLocaleString('pl-PL');
          const artistName = topTrackObj.artist?.name || 'Nieznany';
          topTrackText = `**${artistName} — ${topTrackObj.name}** (${trackPlays} odtworzeń)`;
        }

        // Aktualne / Ostatnie odtwarzanie
        const recentTrack = recentData?.recenttracks?.track?.[0] || (Array.isArray(recentData?.recenttracks?.track) ? recentData.recenttracks.track[0] : recentData?.recenttracks?.track);
        let currentStatusText = '💤 Obecnie niczego nie słucha';
        if (recentTrack) {
          const trackName = recentTrack.name;
          const artistName = recentTrack.artist?.['#text'] || recentTrack.artist?.name || 'Nieznany';
          if (recentTrack['@attr']?.nowplaying === 'true') {
            currentStatusText = `▶️ **Słucha teraz:** **${artistName} — ${trackName}**`;
          } else {
            currentStatusText = `🕰 **Ostatnio:** **${artistName} — ${trackName}**`;
          }
        }

        // Zgodność gustów muzycznych (jeśli sprawdzany jest profil kogoś innego i autor też ma połączone konto)
        let compatibilityText = '';
        if (!isSelf && authorConnection) {
          try {
            const [myArtistsData, targetArtistsData] = await Promise.all([
              fetchLastFMAPI('user.gettopartists', { user: authorConnection.username, limit: 30, period: 'overall' }).catch(() => null),
              fetchLastFMAPI('user.gettopartists', { user: lastfmUser, limit: 30, period: 'overall' }).catch(() => null)
            ]);

            const myArtists = (myArtistsData?.topartists?.artist || []).map(a => a.name.toLowerCase());
            const targetArtists = (targetArtistsData?.topartists?.artist || []).map(a => a.name.toLowerCase());

            if (myArtists.length > 0 && targetArtists.length > 0) {
              const common = myArtists.filter(a => targetArtists.includes(a));
              const matchPercentage = Math.min(100, Math.round((common.length / Math.min(myArtists.length, targetArtists.length)) * 100));

              let level = 'Niska ❄️';
              if (matchPercentage >= 70) level = 'Bardzo wysoka! 🔥';
              else if (matchPercentage >= 40) level = 'Wysoka ✨';
              else if (matchPercentage >= 20) level = 'Średnia 🎶';

              const commonNames = (targetArtistsData?.topartists?.artist || [])
                .filter(a => common.includes(a.name.toLowerCase()))
                .slice(0, 3)
                .map(a => a.name)
                .join(', ');

              compatibilityText = `\n\n🎯 **Zgodność gustu muzycznego z Tobą:** **${matchPercentage}% (${level})**` +
                (commonNames ? `\n🤝 *Wspólni artyści: ${commonNames}*` : '');
            }
          } catch (e) {
            // Ignorujemy błędy zgodności
          }
        }

        const replyMsg = 
          `🤠 **Profil Last.fm — ${targetName}** (${user.name})\n\n` +
          `${currentStatusText}\n\n` +
          `🎵 Wszystkie odtworzenia: **${playcountFormatted}** scrobbli\n` +
          `📈 Średnio dziennie: **${avgDaily}** scrobbli/dzień\n` +
          `📅 Scrobbluje od: **${regDate}**\n\n` +
          `👑 Ulubiony wykonawca: ${topArtistText}\n` +
          `💿 Ulubiony utwór: ${topTrackText}` +
          compatibilityText;

        await sendReplyWithAttachment(client, message, replyMsg, avatar);
      } catch (err) {
        console.error('[LASTFM PROFILE]', err);
        await message.reply(`❌ Wystąpił błąd podczas pobierania profilu: ${err.message}`);
      }
      return;
    }

    // 5. AKTUALNIE (Z ZAŁĄCZNIKIEM OKŁADKI)
    if (['aktualnie', 'current', 'now'].includes(sub)) {
      try {
        const data = await fetchLastFMAPI('user.getrecenttracks', { user: lastfmUser, limit: 1 });
        const tracks = data.recenttracks?.track || [];
        const currentTrack = Array.isArray(tracks) ? tracks[0] : tracks;

        if (currentTrack) {
          const isNowPlaying = currentTrack['@attr']?.nowplaying === 'true';
          const trackName = currentTrack.name;
          const artistName = currentTrack.artist?.['#text'] || currentTrack.artist?.name || 'Nieznany';
          const albumCover = currentTrack.image?.find(img => img.size === 'extralarge' || img.size === 'large')?.['#text'] || '';

          if (isNowPlaying) {
            const query = encodeURIComponent(`${artistName} ${trackName}`);
            const youtubeUrl = `https://www.youtube.com/results?search_query=${query}`;
            const replyMsg = 
              `🎧 **Aktualnie słucha — ${targetName}**\n` +
              `🎶 Utwór: **${trackName}**\n` +
              `👤 Wykonawca: **${artistName}**\n` +
              `📺 Odtwórz: ${youtubeUrl}`;

            await sendReplyWithAttachment(client, message, replyMsg, albumCover);
          } else {
            const replyMsg = 
              `💤 **${targetName}** obecnie niczego nie słucha.\n` +
              `🕰 Ostatnio odtwarzane: **${artistName} - ${trackName}**`;

            await sendReplyWithAttachment(client, message, replyMsg, albumCover);
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

    // 6. OSTATNIE (Z ZAŁĄCZNIKIEM OKŁADKI OSTATNIEGO UTWÓRU)
    if (['ostatnie', 'recent', 'last'].includes(sub)) {
      try {
        const data = await fetchLastFMAPI('user.getrecenttracks', { user: lastfmUser, limit: 5 });
        const tracks = data.recenttracks?.track || [];
        const trackList = Array.isArray(tracks) ? tracks : [tracks];

        if (trackList.length === 0) {
          await message.reply(`🕰 Brak ostatnio odtwarzanych utworów dla użytkownika **${targetName}**.`);
          return;
        }

        const firstCover = trackList[0]?.image?.find(img => img.size === 'extralarge' || img.size === 'large')?.['#text'] || '';

        const lines = trackList.map((t, i) => {
          const isNowPlaying = t['@attr']?.nowplaying === 'true';
          const status = isNowPlaying ? '▶️ *słucha teraz*' : '•';
          const artist = t.artist?.['#text'] || t.artist?.name || 'Nieznany';
          return `${i + 1}. ${status} **${artist}** — **${t.name}**`;
        }).join('\n');

        const replyMsg = `🕰 **Ostatnio słuchane przez ${targetName}**:\n\n${lines}`;

        await sendReplyWithAttachment(client, message, replyMsg, firstCover);
      } catch (err) {
        console.error('[LASTFM RECENT]', err);
        await message.reply(`❌ Wystąpił błąd podczas pobierania ostatnich utworów: ${err.message}`);
      }
      return;
    }

    // 7. TOPUTWORY / TOPARTYŚCI / TOPALBUMY (Z ZAŁĄCZNIKIEM OKŁADKI/ZDJĘCIA TOP 1)
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

        const top1Image = itemList[0]?.image?.find(img => img.size === 'extralarge' || img.size === 'large')?.['#text'] || '';

        const lines = itemList.map((item, i) => {
          const playcount = Number(item.playcount || 0).toLocaleString('pl-PL');
          const artist = item.artist?.name ? `**${item.artist.name}** — ` : '';
          return `${i + 1}. ${artist}**${item.name}** (${playcount} odtworzeń)`;
        }).join('\n');

        const replyMsg = `${categoryEmoji} **Top 10 ${typeLabel} u ${targetName} (${label})**:\n\n${lines}`;

        await sendReplyWithAttachment(client, message, replyMsg, top1Image);
      } catch (err) {
        console.error('[LASTFM TOP]', err);
        await message.reply(`❌ Wystąpił błąd podczas pobierania statystyk: ${err.message}`);
      }
      return;
    }

    // 8. YOUTUBE (Z ZAŁĄCZNIKIEM OKŁADKI)
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
          const albumCover = currentTrack.image?.find(img => img.size === 'extralarge' || img.size === 'large')?.['#text'] || '';

          const replyMsg = 
            `🎶 **YouTube — ${targetName}**\n` +
            `Utwór: **${artistName} - ${trackName}**\n` +
            `🔗 Odtwórz: ${youtubeSearchUrl}`;

          await sendReplyWithAttachment(client, message, replyMsg, albumCover);
        } else {
          await message.reply(`💤 **${targetName}** obecnie niczego nie słucha.`);
        }
      } catch (err) {
        console.error('[LASTFM YOUTUBE]', err);
        await message.reply(`❌ Wystąpił błąd podczas wyszukiwania utworu na YouTube: ${err.message}`);
      }
      return;
    }

    // 9. PLAY (Z ZAŁĄCZNIKIEM OKŁADKI)
    if (sub === 'play') {
      let query = parsedParams.searchQuery;
      let finalTrackName = '';
      let coverImage = '';

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
            coverImage = currentTrack.image?.find(img => img.size === 'extralarge' || img.size === 'large')?.['#text'] || '';
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

      const replyMsg = 
        `💿 **Odtwarzanie/Wyszukiwanie utworu**\n` +
        `Utwór: **${finalTrackName}**\n\n` +
        `*(Last.fm nie obsługuje bezpośredniego sterowania odtwarzaczem, ale możesz posłuchać utworu pod tym linkiem:)*\n` +
        `🔗 Link: ${finalUrl}`;

      await sendReplyWithAttachment(client, message, replyMsg, coverImage);
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
        let firstCover = '';

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
              if (!firstCover) {
                firstCover = currentTrack.image?.find(img => img.size === 'extralarge' || img.size === 'large')?.['#text'] || '';
              }
              statusLines.push(`👤 **${name}** słucha teraz:\n   ▶️ **${artistName}** — **${trackName}**`);
            }
          } catch (e) {
            // Ignorujemy błędy pobierania dla pojedynczych osób z listy
          }
        }

        if (statusLines.length === 0) {
          await message.reply('🧐 Nikt z członków grupy nie słucha obecnie muzyki na połączonych kontach.');
        } else {
          const replyMsg = `🧐 **Czego obecnie słuchają członkowie grupy:**\n\n${statusLines.join('\n\n')}`;
          await sendReplyWithAttachment(client, message, replyMsg, firstCover);
        }
      } catch (err) {
        console.error('[LASTFM GROUP]', err);
        await message.reply(`❌ Wystąpił błąd podczas sprawdzania statusów grupy: ${err.message}`);
      }
      return;
    }
  }
};
