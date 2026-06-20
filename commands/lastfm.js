const fs = require('fs');
const https = require('https');
const path = require('path');
const config = require('../config/config');
const { withData } = require('../utils/storage');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function decodeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .trim();
}

function fetchLastFMPage(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    https.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        if (res.statusCode === 406 || res.statusCode === 429) {
          return reject(new Error(`Last.fm zablokowało zapytanie (HTTP ${res.statusCode}). Spróbuj ponownie za kilka minut (częste odpytywanie).`));
        }
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseProfile(html) {
  const displayMatch = html.match(/<h1 class="header-title">([\s\S]*?)<\/h1>/i);
  let displayName = displayMatch ? displayMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown';

  const scrobblesRegex = /<a[^>]*href="\/user\/[^"]*\/library"[^>]*>([\d,\s.]+)(?:\s*scrobbles)?<\/a>/i;
  const scrobblesMatch = html.match(scrobblesRegex);
  let scrobbles = scrobblesMatch ? scrobblesMatch[1].trim() : '0';

  const avatarMatch = html.match(/<img[^*]*class="[^"]*avatar[^"]*"[^>]*src="([^"]+)"/i) ||
                      html.match(/<div class="header-avatar">[\s\S]*?<img[^>]*src="([^"]+)"/i) ||
                      html.match(/class="header-avatar-inner"[\s\S]*?<img[^>]*src="([^"]+)"/i) ||
                      html.match(/<img[^>]*src="([^"]+)"[^>]*class="[^"]*avatar/i);
  let avatarUrl = avatarMatch ? avatarMatch[1].trim() : '';

  const registeredMatch = html.match(/scrobbling since([\s\S]*?)<\/span>/i) ||
                          html.match(/class="header-scrobble-since"[^>]*>([\s\S]*?)<\/span>/i);
  let registered = registeredMatch ? registeredMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown';

  return {
    displayName,
    scrobbles,
    avatarUrl,
    registered
  };
}

function parseLastFMHTML(data) {
  const items = [];

  if (data.includes('chartlist-row')) {
    const rows = data.split(/<tr[^>]*class="[^"]*chartlist-row/i);
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const nameMatch = row.match(/class="chartlist-name"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
                        row.match(/class="chartlist-artist"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
      const countMatch = row.match(/class="chartlist-count-bar-value"[^>]*>([\s\S]*?)<\/span>/i) ||
                         row.match(/class="chartlist-count-bar-link"[^>]*>([\s\S]*?)<\/a>/i) ||
                         row.match(/class="chartlist-count-bar-value"[\s\S]*?>([\s\S]*?)<\/span>/i);
      const artistMatch = row.match(/class="chartlist-artist"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
      const youtubeMatch = row.match(/data-youtube-url="([^"]+)"/i) ||
                           row.match(/href="(https:\/\/www\.youtube\.com\/watch\?[^"]+)"/i);
      const youtubeUrl = youtubeMatch ? youtubeMatch[1] : null;
      const isNowPlaying = row.includes('chartlist-row--now-scrobbling') ||
                           row.includes('js-now-playing-text') ||
                           row.includes('now-scrobbling');

      if (nameMatch) {
        let name = nameMatch[1].trim().replace(/<[^>]+>/g, '');
        let count = countMatch ? countMatch[1].trim().replace(/<[^>]+>/g, '') : '';
        let artist = artistMatch ? artistMatch[1].trim().replace(/<[^>]+>/g, '') : '';

        name = decodeHTML(name);
        artist = decodeHTML(artist);
        count = decodeHTML(count);

        items.push({ name, artist, count, youtubeUrl, nowPlaying: isNowPlaying });
      }
    }
  } else {
    const gridRegex = /<li[^>]*class="[^"]*grid-items-item[\s\S]*?<\/li>/gi;
    let m;
    while ((m = gridRegex.exec(data)) !== null) {
      const block = m[0];
      const nameMatch = block.match(/class="grid-items-item-main-text"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
      const auxSectionMatch = block.match(/class="grid-items-item-aux-text"([\s\S]*?)<\/p>/i) ||
                              block.match(/class="grid-items-item-aux-text"([\s\S]*?)<\/div>/i);
      let artist = '';
      let count = '';

      if (auxSectionMatch) {
        const auxContent = auxSectionMatch[1];
        const anchors = [];
        const anchorRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
        let am;
        while ((am = anchorRegex.exec(auxContent)) !== null) {
          anchors.push(am[1].trim().replace(/<[^>]+>/g, ''));
        }

        if (anchors.length >= 2) {
          artist = anchors[0];
          count = anchors[1];
        } else if (anchors.length === 1) {
          if (anchors[0].includes('play') || anchors[0].includes('scrobble')) {
            count = anchors[0];
          } else {
            artist = anchors[0];
          }
        }
      }

      if (nameMatch) {
        let name = nameMatch[1].trim().replace(/<[^>]+>/g, '');
        name = decodeHTML(name);
        artist = decodeHTML(artist);
        count = decodeHTML(count);

        items.push({ name, artist, count });
      }
    }
  }

  return items;
}

function parseArgs(message, args) {
  let range = 'all';
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

  const mentioned = message.mentions.users.first();
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

const PRESET_MAPPING = {
  '7d': 'LAST_7_DAYS',
  '1m': 'LAST_30_DAYS',
  '3m': 'LAST_90_DAYS',
  '6m': 'LAST_180_DAYS',
  '12m': 'LAST_365_DAYS',
  'all': 'ALL',
  'overall': 'ALL'
};

const RANGE_LABELS = {
  'LAST_7_DAYS': 'ostatnie 7 dni',
  'LAST_30_DAYS': 'ostatni miesiąc',
  'LAST_90_DAYS': 'ostatnie 3 miesiące',
  'LAST_180_DAYS': 'ostatnie 6 miesięcy',
  'LAST_365_DAYS': 'ostatni rok',
  'ALL': 'cały czas'
};

module.exports = {
  name: 'fm',
  aliases: ['lastfm'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (config.admins.includes(message.author.id) && message.author.id !== creatorId) {
      await message.reply('❌ Nie masz uprawnień do korzystania z tej komendy.');
      return;
    }

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

      const statusMsg = await message.reply(`🔍 Wyszukiwanie profilu Last.fm "${username}"...`);
      try {
        const html = await fetchLastFMPage(`https://www.last.fm/user/${username}`);
        const parsed = parseProfile(html);

        await withData(store => {
          store.profiles.lastfmConnections = store.profiles.lastfmConnections || {};
          store.profiles.lastfmConnections[message.author.id] = {
            username: username,
            incognito: false
          };
        });

        await message.reply(
          `🔌 **Konto połączone pomyślnie!**\n` +
          `Nazwa: **${parsed.displayName}**\n` +
          `Odtworzenia: **${parsed.scrobbles}**\n` +
          `Dołączono: **${parsed.registered}**`
        );
      } catch (err) {
        console.error('[LASTFM CONNECT]', err);
        await message.reply(`❌ Nie udało się znaleźć profilu Last.fm o nazwie "${username}". Upewnij się, że nazwa jest poprawna. Szczegóły: ${err.message}`);
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

    // 2.5 TOP
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

        // Pobierz wszystkie połączenia
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

        const statusMsg = await message.reply(`📊 Pobieranie scrobbli dla ${activeProfiles.length} członków grupy...`);

        // Pobieranie profili w sposób sekwencyjny z opóźnieniem w celu uniknięcia limitów zapytań (HTTP 429)
        const results = [];
        for (const [pid, conn] of activeProfiles) {
          // Sprawdzenie incognito: jeśli użytkownik włączył incognito i nie jest nadawcą wiadomości, pomijamy go w rankingu
          if (conn.incognito === true && pid !== message.author.id) {
            continue;
          }

          const name = await getName(pid);
          try {
            const html = await fetchLastFMPage(`https://www.last.fm/user/${conn.username}`);
            const parsed = parseProfile(html);
            const scrobblesNum = parseInt(parsed.scrobbles.replace(/[^\d]/g, ''), 10) || 0;
            results.push({
              pid,
              name,
              username: conn.username,
              scrobbles: scrobblesNum,
              scrobblesStr: parsed.scrobbles
            });
          } catch (e) {
            // W razie błędu dodajemy z 0 scrobbli, by chociaż figurował w liście
            results.push({
              pid,
              name,
              username: conn.username,
              scrobbles: 0,
              scrobblesStr: '0'
            });
          }
          await sleep(350);
        }

        // Sortowanie po scrobbles malejąco
        results.sort((a, b) => b.scrobbles - a.scrobbles);

        // Tworzenie rankingu Top 5
        const top5 = results.slice(0, 5);
        const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
        const lines = top5.map((r, i) => {
          return `${medals[i]} **${r.name}** (${r.username}) — **${r.scrobblesStr}** scrobbli`;
        }).join('\n');

        // Znajdź pozycję nadawcy wiadomości
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

    // Pozostałe komendy wymagają analizy argumentów
    const parsedParams = parseArgs(message, args.slice(1));
    const targetId = parsedParams.targetId;
    const targetName = parsedParams.targetName;
    const isSelf = (targetId === message.author.id);

    // Sprawdź czy cel ma połączone konto Last.fm
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

    // Sprawdzenie blokady incognito
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
        const html = await fetchLastFMPage(`https://www.last.fm/user/${lastfmUser}`);
        const parsed = parseProfile(html);

        let msg = `🤠 **Profil Last.fm — ${targetName}** (${lastfmUser})\n` +
                  `👤 Nazwa wyświetlana: **${parsed.displayName}**\n` +
                  `🎵 Wszystkie odtworzenia (scrobbles): **${parsed.scrobbles}**\n` +
                  `📅 Scrobbluje od: **${parsed.registered}**`;
        
        if (parsed.avatarUrl) {
          msg += `\n🖼️ Awatar: ${parsed.avatarUrl}`;
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
        const html = await fetchLastFMPage(`https://www.last.fm/user/${lastfmUser}`);
        const tracks = parseLastFMHTML(html);

        if (tracks.length > 0 && tracks[0].nowPlaying) {
          const track = tracks[0];
          let reply = `🎧 **Aktualnie słucha — ${targetName}**\n` +
                      `🎶 Utwór: **${track.name}**\n` +
                      `👤 Wykonawca: **${track.artist}**`;
          if (track.youtubeUrl) {
            reply += `\n📺 Odtwórz: ${track.youtubeUrl}`;
          }
          await message.reply(reply);
        } else if (tracks.length > 0) {
          const track = tracks[0];
          await message.reply(
            `💤 **${targetName}** obecnie niczego nie słucha.\n` +
            `🕰 Ostatnio odtwarzane: **${track.artist} - ${track.name}**`
          );
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
        const html = await fetchLastFMPage(`https://www.last.fm/user/${lastfmUser}`);
        const tracks = parseLastFMHTML(html);

        if (tracks.length === 0) {
          await message.reply(`🕰 Brak ostatnio odtwarzanych utworów dla użytkownika **${targetName}**.`);
          return;
        }

        const lines = tracks.slice(0, 5).map((t, i) => {
          const status = t.nowPlaying ? '▶️ *słucha teraz*' : '•';
          return `${i + 1}. ${status} **${t.artist}** — **${t.name}**`;
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
      
      const presetName = PRESET_MAPPING[parsedParams.range] || 'LAST_30_DAYS';
      const label = RANGE_LABELS[presetName];

      const typeLabel = type === 'artists' ? 'artystów' : (type === 'albums' ? 'albumów' : 'utworów');
      const categoryEmoji = type === 'artists' ? '🤩' : (type === 'albums' ? '💿' : '⭐');

      const statusMsg = await message.reply(`📊 Pobieranie najpopularniejszych ${typeLabel} dla ${targetName} (${label})...`);

      try {
        const partialUrl = `https://www.last.fm/user/${lastfmUser}/library/${type}?date_preset=${presetName}`;
        const html = await fetchLastFMPage(partialUrl);
        const parsedItems = parseLastFMHTML(html);

        if (parsedItems.length === 0) {
          await message.reply(`📊 Brak statystyk ${typeLabel} dla użytkownika **${targetName}** w wybranym przedziale czasowym.`);
          return;
        }

        const lines = parsedItems.slice(0, 10).map((item, i) => {
          let detail = item.artist ? `**${item.artist}** — ` : '';
          return `${i + 1}. ${detail}**${item.name}** (${item.count || '0 odtworzeń'})`;
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
        const html = await fetchLastFMPage(`https://www.last.fm/user/${lastfmUser}`);
        const tracks = parseLastFMHTML(html);

        if (tracks.length > 0) {
          const track = tracks[0];
          const query = encodeURIComponent(`${track.artist} ${track.name}`);
          const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${query}`;
          const directUrl = track.youtubeUrl || youtubeSearchUrl;

          await message.reply(
            `🎶 **YouTube — ${targetName}**\n` +
            `Utwór: **${track.artist} - ${track.name}**\n` +
            `🔗 Odtwórz: ${directUrl}`
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
      // Może być !fm play @osoba lub !fm play nazwa utworu
      let query = parsedParams.searchQuery;
      let finalTrackName = '';
      let finalUrl = '';

      if (!query && args.length > 1) {
        // Jeśli nie wykryto ID ani wzmianki, weź całe wejście po "play" jako frazę
        query = args.slice(1).join(' ').trim();
      }

      if (query) {
        // Użytkownik podał nazwę utworu
        finalTrackName = query;
        finalUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      } else {
        // Wyciągamy aktualny utwór celu
        try {
          const html = await fetchLastFMPage(`https://www.last.fm/user/${lastfmUser}`);
          const tracks = parseLastFMHTML(html);

          if (tracks.length > 0) {
            const track = tracks[0];
            finalTrackName = `${track.artist} - ${track.name}`;
            finalUrl = track.youtubeUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(finalTrackName)}`;
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

        // Pobierz wszystkie połączenia
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

        const statusMsg = await message.reply(`🧐 Sprawdzanie statusów Last.fm dla ${activeProfiles.length} członków grupy...`);
        const statusLines = [];

        for (const [pid, conn] of activeProfiles) {
          // Pomijaj osoby incognito
          if (conn.incognito === true && pid !== message.author.id) {
            continue;
          }

          let name = `Użytkownik_${pid.slice(-6)}`;
          if (client.userNames.has(pid)) {
            name = client.userNames.get(pid);
          } else {
            try {
              name = await client.resolveUserName(client.api, pid);
            } catch (_) {}
          }

          try {
            const html = await fetchLastFMPage(`https://www.last.fm/user/${conn.username}`);
            const tracks = parseLastFMHTML(html);
            if (tracks.length > 0 && tracks[0].nowPlaying) {
              statusLines.push(`👤 **${name}** słucha teraz:\n   ▶️ **${tracks[0].artist}** — **${tracks[0].name}**`);
            }
          } catch (e) {
            // Ignorujemy błędy pobierania dla pojedynczych osób z listy
          }
          await sleep(350);
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
