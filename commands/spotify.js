const config = require('../config/config');
const {
  getAuthUrl,
  exchangeCodeForTokens,
  getSpotifyTokens,
  removeSpotifyTokens,
  getCurrentlyPlaying,
  getTopTracks,
  getTopArtists,
  getRecentlyPlayed,
  getUserProfile,
  getGroupListening,
  addToQueue,
  playTrack,
  searchTrack,
  getTimeRangeLabel
} = require('../utils/spotify');
const { withData, createUser } = require('../utils/storage');
const { formatCurrency, ensureInventoryRecord, hasItem } = require('../utils/economy');

const SPOTIFY_LINK_EXPIRY_MS = 10 * 60 * 1000;

const EMBED_COLORS = {
  primary: config.embed?.primary || 0xD4AF37,
  error: 0xFF0000,
  success: 0x00FF00,
  spotify: 0x1DB954
};

function baseSpotifyEmbed() {
  return {
    title: 'Spotify Integration',
    color: EMBED_COLORS.spotify,
    footer: { text: 'Powered by Spotify API' }
  };
}

module.exports = {
  name: 'spotify',
  aliases: ['sp'],
  async execute(client, message, args) {
    const prefix = message.prefix || config.prefix || '!';
    const sub = String(args[0] || '').toLowerCase();
    const subArgs = args.slice(1);

    if (!sub) {
      await message.reply({
        embeds: [{
          ...baseSpotifyEmbed(),
          title: '🎛️ Spotify Komendy',
          description: [
            '🔌 `' + prefix + 'spotify połącz` — Połącz profil z Spotify',
            '🔥 `' + prefix + 'spotify odłącz` — Odłącz profil od Spotify',
            '🤠 `' + prefix + 'spotify profil [@użytkownik]` — Sprawdź profil Spotify',
            '🧐 `' + prefix + 'spotify grupa` — Sprawdź co słuchają członkowie grupy',
            '🎧 `' + prefix + 'spotify aktualnie [@użytkownik]` — Sprawdź co aktualnie słuchasz',
            '⭐ `' + prefix + 'spotify toputwory 1m/6m/12m [@użytkownik]` — Najczęściej słuchane utwory',
            '🤩 `' + prefix + 'spotify topartyści 1m/6m/12m [@użytkownik]` — Najczęściej słuchani artyści',
            '🕰 `' + prefix + 'spotify ostatnie [@użytkownik]` — Ostatnio słuchane utwory',
            '🥸 `' + prefix + 'spotify incognito on/off` — Tryb prywatności',
            '📋 `' + prefix + 'spotify kolejka <utwór lub @użytkownik>` — Dodaj do kolejki',
            '💿 `' + prefix + 'spotify play <utwór lub @użytkownik>` — Odtwórz utwór',
            '🎶 `' + prefix + 'spotify youtube [@użytkownik]` — Wyślij utwór z YouTube'
          ].join('\n')
        }]
      });
      return;
    }

    switch (sub) {
      case 'połącz':
      case 'polacz':
      case 'connect':
        await handleConnect(client, message, prefix);
        break;
      case 'odłącz':
      case 'rozlacz':
      case 'disconnect':
        await handleDisconnect(client, message);
        break;
      case 'profil':
        await handleProfile(client, message, subArgs);
        break;
      case 'grupa':
        await handleGroup(client, message);
        break;
      case 'aktualnie':
        await handleCurrentlyPlaying(client, message, subArgs);
        break;
      case 'toputwory':
      case 'toputwory':
        await handleTopTracks(client, message, subArgs);
        break;
      case 'topartysci':
      case 'topartyści':
        await handleTopArtists(client, message, subArgs);
        break;
      case 'ostatnie':
        await handleRecent(client, message, subArgs);
        break;
      case 'incognito':
        await handleIncognito(client, message, subArgs);
        break;
      case 'kolejka':
      case 'queue':
        await handleQueue(client, message, subArgs);
        break;
      case 'play':
        await handlePlay(client, message, subArgs);
        break;
      case 'youtube':
        await handleYoutube(client, message, subArgs);
        break;
      default:
        await message.reply('❌ Nieznana podkomenda Spotify. Wpisz `' + prefix + 'spotify` aby zobaczyć listę.');
    }
  }
};

async function handleConnect(client, message) {
  const userId = message.author.id;
  const existing = await getSpotifyTokens(userId);

  if (existing && existing.access_token) {
    await message.reply('✅ Jesteś już połączony z Spotify. Jeśli chcesz się odnowić połączenie, użyj `!spotify odłącz` a następnie `!spotify połącz`.');
    return;
  }

  const state = Buffer.from(`${userId}:${Date.now()}`).toString('base64').slice(0, 32);
  stateStore.set(state, { userId, createdAt: Date.now() });

  const authUrl = getAuthUrl(userId, state);
  const expiryTime = new Date(Date.now() + SPOTIFY_LINK_EXPIRY_MS);

  await message.reply({
    embeds: [{
      ...baseSpotifyEmbed(),
      title: '🔌 Połączenie Spotify',
      description: 'Kliknij poniższy link aby połączyć swoje konto Spotify:\n\n' +
        `[🔗 Połącz z Spotify](${authUrl})\n\n` +
        `⏳ Link wygaśnie za **10 minut**.`,
      fields: [
        { name: 'Ważne', value: 'Nie udostępniaj tego linku innym osobom.' }
      ]
    }]
  });
}

async function handleDisconnect(client, message) {
  const userId = message.author.id;
  await removeSpotifyTokens(userId);
  await message.reply('✅ Pomyślnie odłączyłeś profil od Spotify.');
}

async function handleProfile(client, message, args) {
  const targetUserId = await resolveTargetUserId(client, message, args);
  if (!targetUserId) return;

  const result = await getUserProfile(targetUserId);
  if (result.error) {
    await message.reply(result.error);
    return;
  }

  const profile = result.data;
  await message.reply({
    embeds: [{
      ...baseSpotifyEmbed(),
      title: `🤠 Profil Spotify: ${profile.display_name || 'Nieznany'}`,
      description: [
        `🆔 ID: \`${profile.id}\``,
        `📧 Email: ${profile.email || 'N/A'}`,
        `🌍 Kraj: ${profile.country || 'N/A'}`,
        `💎 Plan: ${profile.product || 'N/A'}`,
        `👥 Obserwujący: ${profile.followers.toLocaleString()}`,
        profile.image ? `🖼️ [Avatar](${profile.image})` : '',
        profile.url ? `🔗 [Profil](${profile.url})` : ''
      ].filter(Boolean).join('\n')
    }]
  });
}

async function handleGroup(client, message) {
  const threadId = message.threadID;
  const groupInfo = await withData(store => {
    const gs = store.groupStats || {};
    return gs[threadId] || null;
  });

  if (!groupInfo || !groupInfo.members || groupInfo.members.length === 0) {
    await message.reply('❌ Nie udało się pobrać listy członków grupy.');
    return;
  }

  const memberIds = groupInfo.members.map(m => m.userId || m.id).filter(Boolean);
  const listening = await getGroupListening(memberIds);

  if (listening.length === 0) {
    await message.reply('❌ Nikt z członków grupy obecnie nie słucha muzyki na Spotify.');
    return;
  }

  const description = listening.map(item => {
    const track = item.track;
    return `🎵 **${track.name}** — ${track.artists}\n👤 <@${item.userId}>`;
  }).join('\n\n');

  await message.reply({
    embeds: [{
      ...baseSpotifyEmbed(),
      title: '🧐 Co słuchają w tej grupie',
      description
    }]
  });
}

async function handleCurrentlyPlaying(client, message, args) {
  const targetUserId = await resolveTargetUserId(client, message, args);
  if (!targetUserId) return;

  const result = await getCurrentlyPlaying(targetUserId);
  if (result.error) {
    await message.reply(result.error);
    return;
  }

  if (!result.data) {
    await message.reply('❌ Użytkownik obecnie nie słucha niczego na Spotify.');
    return;
  }

  const { track, isPlaying, progress_ms } = result.data;
  const progressPercent = Math.round((progress_ms / track.duration_ms) * 100);

  await message.reply({
    embeds: [{
      ...baseSpotifyEmbed(),
      title: `🎧 Aktualnie słucha: ${track.name}`,
      description: [
        `🎤 Artysta: ${track.artists}`,
        `💿 Album: ${track.album}`,
        `▶️ Status: ${isPlaying ? 'Odtwarzanie' : 'Pauza'}`,
        `⏱️ Postęp: ${progressPercent}%`,
        track.url ? `🔗 [Otwórz w Spotify](${track.url})` : ''
      ].filter(Boolean).join('\n'),
      thumbnail: track.cover ? { url: track.cover } : undefined
    }]
  });
}

async function handleTopTracks(client, message, args) {
  const targetUserId = await resolveTargetUserId(client, message, args.slice(1));
  if (!targetUserId) return;

  const timeRangeArg = String(args[0] || '6m').toLowerCase();
  const timeRangeMap = { '1m': 'short_term', '6m': 'medium_term', '12m': 'long_term' };
  const timeRange = timeRangeMap[timeRangeArg] || 'medium_term';

  const result = await getTopTracks(targetUserId, timeRange);
  if (result.error) {
    await message.reply(result.error);
    return;
  }

  if (!result.data || result.data.length === 0) {
    await message.reply('❌ Brak danych o najczęściej słuchanych utworach.');
    return;
  }

  const description = result.data.slice(0, 10).map((track, idx) => {
    return `${idx + 1}. **${track.name}** — ${track.artists}`;
  }).join('\n');

  await message.reply({
    embeds: [{
      ...baseSpotifyEmbed(),
      title: `⭐ Top utwory — ${getTimeRangeLabel(timeRange)}`,
      description
    }]
  });
}

async function handleTopArtists(client, message, args) {
  const targetUserId = await resolveTargetUserId(client, message, args.slice(1));
  if (!targetUserId) return;

  const timeRangeArg = String(args[0] || '6m').toLowerCase();
  const timeRangeMap = { '1m': 'short_term', '6m': 'medium_term', '12m': 'long_term' };
  const timeRange = timeRangeMap[timeRangeArg] || 'medium_term';

  const result = await getTopArtists(targetUserId, timeRange);
  if (result.error) {
    await message.reply(result.error);
    return;
  }

  if (!result.data || result.data.length === 0) {
    await message.reply('❌ Brak danych o najczęściej słuchanych artystach.');
    return;
  }

  const description = result.data.slice(0, 10).map((artist, idx) => {
    const genres = artist.genres.length > 0 ? ` (${artist.genres.join(', ')})` : '';
    return `${idx + 1}. **${artist.name}**${genres}\n   👥 ${artist.followers.toLocaleString()} obserwujących`;
  }).join('\n');

  await message.reply({
    embeds: [{
      ...baseSpotifyEmbed(),
      title: `🤩 Top artyści — ${getTimeRangeLabel(timeRange)}`,
      description
    }]
  });
}

async function handleRecent(client, message, args) {
  const targetUserId = await resolveTargetUserId(client, message, args);
  if (!targetUserId) return;

  const result = await getRecentlyPlayed(targetUserId, 20);
  if (result.error) {
    await message.reply(result.error);
    return;
  }

  if (!result.data || result.data.length === 0) {
    await message.reply('❌ Brak historii odtwarzania.');
    return;
  }

  const description = result.data.slice(0, 10).map((item, idx) => {
    const track = item.track;
    const date = new Date(item.played_at).toLocaleString('pl-PL');
    return `${idx + 1}. **${track.name}** — ${track.artists}\n   🕒 ${date}`;
  }).join('\n');

  await message.reply({
    embeds: [{
      ...baseSpotifyEmbed(),
      title: '🕰 Ostatnio słuchane utwory',
      description
    }]
  });
}

async function handleIncognito(client, message, args) {
  const userId = message.author.id;
  const mode = String(args[0] || '').toLowerCase();

  if (!mode || !['on', 'off'].includes(mode)) {
    await message.reply('❌ Podaj tryb: `on` lub `off`. Przykład: `!spotify incognito on`');
    return;
  }

  await withData(store => {
    if (!store.spotify) store.spotify = {};
    if (!store.spotify[userId]) store.spotify[userId] = {};
    store.spotify[userId].incognito = mode === 'on';
  });

  await message.reply(mode === 'on'
    ? '🥸 Tryb incognito włączony. Inni członkowie grupy nie będą mogli sprawdzać Twoich statystyk Spotify.'
    : '👁️ Tryb incognito wyłączony. Inni członkowie grupy mogą teraz sprawdzać Twoje statystyki Spotify.'
  );
}

async function handleQueue(client, message, args) {
  const userId = message.author.id;
  const tokens = await getSpotifyTokens(userId);
  if (!tokens) {
    await message.reply('❌ Musisz być połączony z Spotify. Użyj `!spotify połącz`.');
    return;
  }

  let trackUri = null;

  if (args.length > 0 && args[0].startsWith('<@')) {
    const targetUserId = args[0].replace(/[<@!>]/g, '');
    const targetResult = await getCurrentlyPlaying(targetUserId);
    if (targetResult.error) {
      await message.reply(targetResult.error);
      return;
    }
    if (!targetResult.data) {
      await message.reply('❌ Użytkownik nie słucha obecnie niczego na Spotify.');
      return;
    }
    trackUri = `spotify:track:${targetResult.data.track.id}`;
  } else {
    const query = args.join(' ');
    if (!query) {
      await message.reply('❌ Podaj nazwę utworu lub oznacz użytkownika. Przykład: `!spotify kolejka Bohemian Rhapsody`');
      return;
    }
    const track = await searchTrack(query);
    if (!track) {
      await message.reply('❌ Nie znaleziono utworu o podanej nazwie.');
      return;
    }
    trackUri = track.uri;
  }

  const result = await addToQueue(userId, trackUri);
  if (result.error) {
    await message.reply(result.error);
    return;
  }

  await message.reply(`✅ Dodano utwór do kolejki odtwarzania na Spotify.`);
}

async function handlePlay(client, message, args) {
  const userId = message.author.id;
  const tokens = await getSpotifyTokens(userId);
  if (!tokens) {
    await message.reply('❌ Musisz być połączony z Spotify. Użyj `!spotify połącz`.');
    return;
  }

  let trackUri = null;

  if (args.length > 0 && args[0].startsWith('<@')) {
    const targetUserId = args[0].replace(/[<@!>]/g, '');
    const targetResult = await getCurrentlyPlaying(targetUserId);
    if (targetResult.error) {
      await message.reply(targetResult.error);
      return;
    }
    if (!targetResult.data) {
      await message.reply('❌ Użytkownik nie słucha obecnie niczego na Spotify.');
      return;
    }
    trackUri = `spotify:track:${targetResult.data.track.id}`;
  } else {
    const query = args.join(' ');
    if (!query) {
      await message.reply('❌ Podaj nazwę utworu lub oznacz użytkownika. Przykład: `!spotify play Bohemian Rhapsody`');
      return;
    }
    const track = await searchTrack(query);
    if (!track) {
      await message.reply('❌ Nie znaleziono utworu o podanej nazwie.');
      return;
    }
    trackUri = track.uri;
  }

  const result = await playTrack(userId, trackUri);
  if (result.error) {
    await message.reply(result.error);
    return;
  }

  await message.reply(`▶️ Rozpoczęto odtwarzanie utworu na Spotify.`);
}

async function handleYoutube(client, message, args) {
  const targetUserId = await resolveTargetUserId(client, message, args);
  if (!targetUserId) return;

  const result = await getCurrentlyPlaying(targetUserId);
  if (result.error) {
    await message.reply(result.error);
    return;
  }

  if (!result.data) {
    await message.reply('❌ Użytkownik obecnie nie słucha niczego na Spotify.');
    return;
  }

  const track = result.data.track;
  const query = encodeURIComponent(`${track.name} ${track.artists}`);
  const youtubeUrl = `https://www.youtube.com/results?search_query=${query}`;

  await message.reply({
    embeds: [{
      ...baseSpotifyEmbed(),
      title: `🎶 ${track.name}`,
      description: [
        `🎤 Artysta: ${track.artists}`,
        `💿 Album: ${track.album}`,
        `🔗 [Szukaj na YouTube](${youtubeUrl})`
      ].join('\n'),
      thumbnail: track.cover ? { url: track.cover } : undefined
    }]
  });
}

async function resolveTargetUserId(client, message, args) {
  if (args.length > 0 && args[0].startsWith('<@')) {
    const mentionId = args[0].replace(/[<@!>]/g, '');
    return mentionId;
  }

  return message.author.id;
}

async function handleSpotifyCallback(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>❌ Błąd autoryzacji Spotify</h1><p>Nie udało się połączyć konta Spotify.</p>');
    return;
  }

  if (!code || !state) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>❌ Nieprawidłowe żądanie</h1>');
    return;
  }

  const stateData = stateStore.get(state);
  if (!stateData) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>❌ Nieprawidłowy stan autoryzacji</h1>');
    return;
  }

  stateStore.delete(state);
  const userId = stateData.userId;

  const tokens = await exchangeCodeForTokens(code);
  if (!tokens) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>❌ Nie udało się wymienić kodu na token</h1>');
    return;
  }

  await saveSpotifyTokens(userId, tokens);

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>✅ Połączenie Spotify zakończone sukcesem!</h1><p>Możesz zamknąć tę kartę i wrócić do czatu.</p>');
}

module.exports.handleSpotifyCallback = handleSpotifyCallback;
