const fs = require('fs');
const https = require('https');
const path = require('path');
const config = require('../config/config');

function getCookieString() {
  try {
    const appState = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'appstate.json'), 'utf8'));
    return appState.map(c => `${c.key}=${c.value}`).join('; ');
  } catch (err) {
    console.error('[ADD] Error reading appstate.json:', err);
    return '';
  }
}

function parseFBInput(input) {
  input = input.trim();
  
  // Jeśli to czysty identyfikator cyfrowy
  if (/^\d+$/.test(input)) {
    return { type: 'id', value: input };
  }
  
  // Spróbuj sparsować jako URL
  try {
    let urlString = input;
    if (!/^https?:\/\//i.test(urlString)) {
      urlString = 'https://' + urlString;
    }
    const parsedUrl = new URL(urlString);
    
    if (/(?:^|\.)facebook\.com$/i.test(parsedUrl.hostname)) {
      // Obsługa profile.php?id=<ID>
      if (parsedUrl.pathname === '/profile.php') {
        const id = parsedUrl.searchParams.get('id');
        if (id && /^\d+$/.test(id)) {
          return { type: 'id', value: id };
        }
      }
      
      const pathParts = parsedUrl.pathname.split('/').filter(p => p.length > 0);
      if (pathParts.length > 0) {
        const username = pathParts[0];
        const nonUsernames = ['groups', 'pages', 'events', 'messages', 'notifications', 'settings', 'friends', 'marketplace'];
        if (!nonUsernames.includes(username.toLowerCase())) {
          return { type: 'username', value: username };
        }
      }
    }
  } catch (err) {
    // Ignoruj błąd parsowania URL, potraktuj wejście jako potencjalną nazwę użytkownika poniżej
  }
  
  return { type: 'username', value: input };
}

function resolveUIDFromUsername(username) {
  return new Promise((resolve, reject) => {
    const cookieStr = getCookieString();
    const url = `https://www.facebook.com/${username}`;
    const options = {
      headers: {
        'Cookie': cookieStr,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1'
      }
    };

    https.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Błąd serwera Facebook (HTTP ${res.statusCode})`));
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        // Pattern 1: userVanity i userID
        const escapedUsername = username.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const vanityRegex = new RegExp(`"userVanity"\\s*:\\s*"${escapedUsername}"\\s*,\\s*"userID"\\s*:\\s*"(\\d+)"`, 'i');
        const vanityMatch = data.match(vanityRegex);
        if (vanityMatch && vanityMatch[1]) {
          return resolve(vanityMatch[1]);
        }

        // Pattern 2: "userID":"(\d+)"
        const userIdRegex = /"userID"\s*:\s*"(\d+)"/g;
        let m;
        const matchedIds = [];
        while ((m = userIdRegex.exec(data)) !== null) {
          matchedIds.push(m[1]);
        }
        
        // Odfiltruj ID bota (viewerID)
        const viewerIdRegex = /"viewerID"\s*:\s*"(\d+)"/;
        const viewerIdMatch = data.match(viewerIdRegex);
        const viewerId = viewerIdMatch ? viewerIdMatch[1] : null;

        const candidateIds = matchedIds.filter(id => id !== viewerId);
        if (candidateIds.length > 0) {
          return resolve(candidateIds[0]);
        }

        // Pattern 3: profileID
        const fbProfileRegex = /"profileID"\s*:\s*"(\d+)"/;
        const fbProfileMatch = data.match(fbProfileRegex);
        if (fbProfileMatch && fbProfileMatch[1] && fbProfileMatch[1] !== viewerId) {
          return resolve(fbProfileMatch[1]);
        }

        reject(new Error(`Nie odnaleziono ID użytkownika dla nazwy profilu: ${username}`));
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = {
  name: 'add',
  aliases: ['dodaj'],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;
    if (!threadId) {
      await message.reply('❌ Ta komenda może być używana tylko w konwersacjach grupowych.');
      return;
    }

    if (!client.api) {
      await message.reply('❌ Brak połączenia z API Messengera.');
      return;
    }

    if (!args[0]) {
      await message.reply('❌ Podaj link do konta FB, nazwę użytkownika lub ID: **!add <link/username/id>**');
      return;
    }

    // Pobierz informacje o grupie i sprawdź uprawnienia
    try {
      const info = await new Promise((resolve, reject) => {
        client.api.getThreadInfo(threadId, (err, ret) => {
          if (err) return reject(err);
          resolve(ret);
        });
      });

      if (!info) {
        await message.reply('❌ Błąd podczas pobierania informacji o grupie.');
        return;
      }

      const adminIDs = (info.adminIDs || []).map(admin => {
        if (typeof admin === 'object' && admin !== null) {
          return admin.id || admin.userID;
        }
        return admin;
      }).filter(Boolean);

      const botId = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : '';

      // Sprawdź czy bot jest adminem
      const isBotAdmin = adminIDs.includes(botId);
      if (!isBotAdmin) {
        await message.reply('❌ Bot nie jest administratorem tej grupy i nie może dodawać członków.');
        return;
      }

      // Sprawdź czy nadawca jest adminem grupy lub adminem bota
      const isSenderAdmin = adminIDs.includes(message.author.id) || config.admins.includes(message.author.id);
      if (!isSenderAdmin) {
        await message.reply('❌ Tylko administratorzy grupy lub bota mogą używać tej komendy.');
        return;
      }

      const input = args.join(' ');
      const parsed = parseFBInput(input);
      let targetId = null;

      if (parsed.type === 'id') {
        targetId = parsed.value;
      } else {
        const loadingMsg = await message.reply(`🔍 Rozpoznano nazwę użytkownika/link "${parsed.value}". Trwa pobieranie ID z Facebooka...`);
        try {
          targetId = await resolveUIDFromUsername(parsed.value);
        } catch (resolveErr) {
          console.error('[ADD] Błąd pobierania UID:', resolveErr);
          await message.reply(`❌ Nie udało się ustalić ID dla "${parsed.value}": ${resolveErr.message}`);
          return;
        }
      }

      if (!targetId || !/^\d+$/.test(targetId)) {
        await message.reply('❌ Nieprawidłowy format ID użytkownika.');
        return;
      }

      // Sprawdź czy użytkownik jest już w grupie
      const participantIDs = info.participantIDs || [];
      if (participantIDs.includes(targetId)) {
        await message.reply('ℹ️ Ten użytkownik jest już w tej grupie.');
        return;
      }

      // Spróbuj dodać do grupy
      await new Promise((resolve, reject) => {
        client.api.addUserToGroup(targetId, threadId, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      // Spróbuj pobrać imię użytkownika do ładnej wiadomości zwrotnej
      let finalName = `Użytkownik (${targetId})`;
      try {
        const resolvedName = await client.resolveUserName(client.api, targetId);
        if (resolvedName && !resolvedName.startsWith('Użytkownik_')) {
          finalName = resolvedName;
        }
      } catch (_) {}

      await message.reply(`✅ Pomyślnie dodano użytkownika **${finalName}** do grupy.`);

    } catch (err) {
      console.error('[ADD] Błąd podczas dodawania do grupy:', err);
      await message.reply(`❌ Błąd podczas dodawania użytkownika do grupy. (Facebook może blokować dodanie tej osoby ze względów prywatności lub ograniczeń konta).`);
    }
  }
};
